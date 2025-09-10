// Minimal, reliable "send to Shopify" for Inventory
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const API_VER = '2024-07'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}})

function up(s:string){return (s||'').toUpperCase()}
function parseIdFromGid(gid?:string|null){if(!gid)return null;const m=String(gid).match(/\/(\d+)$/);return m?m[1]:null}
async function sleep(ms:number){return new Promise(r=>setTimeout(r,ms))}
async function fetchRetry(i:RequestInfo,init?:RequestInit,tries=3){let last:any;for(let t=0;t<tries;t++){try{const r=await fetch(i,init);if(r.ok||(r.status>=400&&r.status<500))return r;last=new Error(`HTTP ${r.status}`)}catch(e){last=e}await sleep(200*(t+1))}throw last}

async function loadStore(supabase:any, storeKey:string){
  const U=up(storeKey)
  const {data,error}=await supabase.from('system_settings').select('key_name,key_value')
    .in('key_name',[`SHOPIFY_${U}_STORE_DOMAIN`,`SHOPIFY_${U}_ACCESS_TOKEN`])
  if(error) throw new Error(error.message)
  const m=new Map<string,string>(); for(const row of data??[]) m.set(row.key_name,row.key_value)
  const domain=m.get(`SHOPIFY_${U}_STORE_DOMAIN`)||''; const token=m.get(`SHOPIFY_${U}_ACCESS_TOKEN`)||''
  if(!domain||!token) throw new Error(`Missing Shopify creds for ${storeKey}`)
  return {domain,token}
}

async function findVariants(domain:string, token:string, sku:string){
  const u=`https://${domain}/admin/api/${API_VER}/variants.json?sku=${encodeURIComponent(sku)}&limit=50`
  const r=await fetchRetry(u,{headers:{'X-Shopify-Access-Token':token,'Content-Type':'application/json'}})
  const b=await r.json()
  return (b.variants as any[])||[]
}

async function getProduct(domain:string, token:string, id:string){
  const r=await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${id}.json`,{headers:{'X-Shopify-Access-Token':token,'Content-Type':'application/json'}})
  const b=await r.json(); if(!r.ok) throw new Error(`Fetch product failed: ${r.status}`); return b.product
}
async function publishIfNeeded(domain:string, token:string, productId:string){
  const p=await getProduct(domain,token,productId)
  if(p?.status!=='active'){
    const r=await fetchRetry(`https://${domain}/admin/api/${API_VER}/products/${productId}.json`,{
      method:'PUT', headers:{'X-Shopify-Access-Token':token,'Content-Type':'application/json'},
      body:JSON.stringify({product:{id:productId,status:'active'}})
    })
    if(!r.ok) throw new Error(`Publish failed: ${r.status}`)
  }
}

async function createProduct(domain:string, token:string, sku:string, title?:string|null, price?:number|null, barcode?:string|null){
  const payload={product:{title:title||sku,status:'active',variants:[{sku,price:price!=null?Number(price).toFixed(2):undefined,barcode:barcode||undefined,inventory_management:'shopify'}]}}
  const r=await fetchRetry(`https://${domain}/admin/api/${API_VER}/products.json`,{
    method:'POST', headers:{'X-Shopify-Access-Token':token,'Content-Type':'application/json'}, body:JSON.stringify(payload)
  })
  const b=await r.json(); if(!r.ok) throw new Error(`Create product failed: ${r.status} ${JSON.stringify(b)}`); return b.product
}

async function setInventory(domain:string, token:string, inventory_item_id:string, location_id:string, available:number){
  const r=await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`,{
    method:'POST', headers:{'X-Shopify-Access-Token':token,'Content-Type':'application/json'},
    body:JSON.stringify({inventory_item_id,location_id,available})
  })
  if(!r.ok) throw new Error(`Inventory set failed: ${r.status} ${await r.text()}`)
}

Deno.serve( async (req) => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS})
  const { createClient } = await import('jsr:@supabase/supabase-js')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global:{headers:{Authorization:req.headers.get('Authorization')||''}}
  })
  try{
    const { storeKey, sku, title, price, barcode, locationGid, quantity, intakeItemId } = await req.json().catch(()=>({}))
    if(!storeKey||!sku||!locationGid||quantity==null) return json(400,{error:'Expected { storeKey, sku, locationGid, quantity, title?, price?, barcode?, intakeItemId? }'})

    const {domain,token}=await loadStore(supabase,storeKey)

    // ensure variant exists
    const matches = await findVariants(domain, token, sku)
    let productId:string, variantId:string, inventoryItemId:string
    if(matches.length){
      const v = matches.find((x:any)=>x?.product?.status==='active') || matches[0]
      productId=String(v.product_id); variantId=String(v.id); inventoryItemId=String(v.inventory_item_id)
      await publishIfNeeded(domain, token, productId)
    }else{
      const p = await createProduct(domain, token, sku, title, price, barcode)
      productId=String(p.id); variantId=String(p.variants?.[0]?.id); inventoryItemId=String(p.variants?.[0]?.inventory_item_id)
    }

    // set inventory at selected location
    const locationId = parseIdFromGid(locationGid); if(!locationId) throw new Error('Invalid locationGid')
    await setInventory(domain, token, inventoryItemId, String(locationId), Number(quantity))

    // optional write-back
    if(intakeItemId){
      await supabase.from('intake_items').update({
        shopify_product_id: productId,
        shopify_variant_id: variantId,
        shopify_inventory_item_id: inventoryItemId,
        pushed_at: new Date().toISOString(),
      }).eq('id', intakeItemId)
    }

    return json(200,{ok:true, productId, variantId, inventoryItemId})
  }catch(e:any){
    console.error('v2-shopify-send', e?.message||e)
    return json(500,{ok:false, error:e?.message||'Internal error'})
  }
})