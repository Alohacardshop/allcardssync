import React, { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import RawIntake from "@/components/RawIntake";
import { Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { cleanupAuthState } from "@/lib/auth";
import { printNodeService } from "@/lib/printNodeService";
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { LabelPreviewCanvas } from "@/components/LabelPreviewCanvas";
import { buildTitleFromParts, buildLabelDataFromItem } from '@/lib/labelData';
import { getLabelDesignerSettings } from '@/lib/labelDesignerSettings';
import PDFLabelPreview from "@/components/PDFLabelPreview";

// Helper function to format price as money
const formatMoney = (price?: string): string => {
  if (!price) return '';
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return price;
  return `$${Math.round(numPrice)}`;
};


type CardItem = {
  title: string;
  set: string;
  player?: string;
  year?: string;
  grade?: string;
  psaCert?: string;
  price?: string;
  cost?: string;
  lot?: string;
  sku?: string;
  brandTitle?: string;
  subject?: string;
  category?: string;
  variant?: string;
  labelType?: string;
  cardNumber?: string;
  quantity?: number;
  id?: string;
  printedAt?: string | null;
  pushedAt?: string | null;
};

const Index = () => {
  const [item, setItem] = useState<CardItem>({
    title: "",
    set: "",
    player: "",
    year: "",
    grade: "",
    psaCert: "",
    price: "",
    cost: "",
    lot: "",
    sku: "",
    brandTitle: "",
    subject: "",
    category: "",
    variant: "",
    labelType: "",
    cardNumber: "",
    quantity: 1,
  });
  const [batch, setBatch] = useState<CardItem[]>([]);
  const [lookupCert, setLookupCert] = useState("");

  // PrintNode state
  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [printNodeConnected, setPrintNodeConnected] = useState(false);
  const [defaultTemplates, setDefaultTemplates] = useState<{graded?: any, raw?: any}>({});

  // New UI state for bulk actions
  const [printingAll, setPrintingAll] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  const [pushPrintAllRunning, setPushPrintAllRunning] = useState(false);

  // Hardened printing locks
  const printingIdsRef = useRef<Set<string>>(new Set());
  const jobInFlightRef = useRef(false);
  const [jobInFlight, setJobInFlight] = useState(false);

  // Inline edit state for Batch Queue
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editYear, setEditYear] = useState<string>("");
  const [editBrandTitle, setEditBrandTitle] = useState<string>("");
  const [editSubject, setEditSubject] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editVariant, setEditVariant] = useState<string>("");
  const [editCardNumber, setEditCardNumber] = useState<string>("");
  const [editGrade, setEditGrade] = useState<string>("");
  const [editPsaCert, setEditPsaCert] = useState<string>("");
  const [editPrice, setEditPrice] = useState<string>("");
  const [editCost, setEditCost] = useState<string>("");
  const [editQty, setEditQty] = useState<number>(1);
  const [editSku, setEditSku] = useState<string>("");
  // Details dialog state
  const [detailsItem, setDetailsItem] = useState<CardItem | null>(null);
  // Categories and Games for dropdowns
  const [categories, setCategories] = useState<string[]>([]);
  type GameOption = { id: number; name: string; categoryId: number | null; categoryName: string | null };
  const [games, setGames] = useState<GameOption[]>([]);
  const [editGameId, setEditGameId] = useState<number | null>(null);
  // Lock helpers
  const acquireRowLock = (id: string) => {
    if (!id) return false;
    if (printingIdsRef.current.has(id)) return false;
    printingIdsRef.current.add(id);
    return true;
  };
  
  const releaseRowLock = (id: string) => {
    if (!id) return;
    printingIdsRef.current.delete(id);
  };

  const acquireGlobalLock = () => {
    if (jobInFlightRef.current) return false;
    jobInFlightRef.current = true;
    setJobInFlight(true);
    return true;
  };
  
  const releaseGlobalLock = () => {
    jobInFlightRef.current = false;
    setJobInFlight(false);
  };

  const handleSignOut = async () => {
    try {
      cleanupAuthState();
      try { await supabase.auth.signOut({ scope: 'global' } as any); } catch {}
    } finally {
      window.location.href = '/auth';
    }
  };

  // buildTitleFromParts moved to labelData.ts for reuse

  // Common PSA grades for quick selection
  const PSA_GRADE_OPTIONS = [
    "Raw",
    "Authentic",
    "PR 1",
    "FR 1.5",
    "GOOD 2",
    "VG 3",
    "VG-EX 4",
    "EX 5",
    "EX-MT 6",
    "NM 7",
    "NM-MT 8",
    "MINT 9",
    "GEM MT 10",
  ];

  // Persist printer selection
  useEffect(() => {
    if (selectedPrinterId) {
      localStorage.setItem('printnode-selected-printer', String(selectedPrinterId));
    }
  }, [selectedPrinterId]);

  // StrictMode guards
  const didInitMainRef = useRef(false);
  const didInitCatsGamesRef = useRef(false);
  const didInitIntakeListenerRef = useRef(false);

  // Load existing items from DB so batch persists
  useEffect(() => {
    if (didInitMainRef.current) return;
    didInitMainRef.current = true;
    const loadBatch = async () => {
      console.log("Loading intake items from DB");
      const { data, error } = await supabase
        .from("intake_items")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load intake_items", error);
        toast.error("Failed to load existing batch");
        return;
      }

      const mapped: CardItem[] =
        (data || []).map((row: any) => ({
          title: buildTitleFromParts(row.year, row.brand_title, row.card_number, row.subject, row.variant),
          set: "",
          year: row.year || "",
          grade: row.grade || "",
          psaCert: row.psa_cert || "",
          price: row?.price != null ? String(row.price) : "",
          cost: row?.cost != null ? String(row.cost) : "",
          lot: row.lot_number || "",
          sku: row.sku || "",
          brandTitle: row.brand_title || "",
          subject: row.subject || "",
          category: row.category || "",
          variant: row.variant || "",
          cardNumber: row.card_number || "",
          id: row.id,
          printedAt: row.printed_at || null,
          pushedAt: row.pushed_at || null,
        })) || [];

      // Only show items that have not been pushed yet in the queue
      setBatch(mapped.filter((m) => !m.pushedAt));
    };

    const loadPrintNode = async () => {
      try {
        const printerList = await printNodeService.getPrinters();
        setPrinters(printerList);
        setPrintNodeConnected(true);
        
        // Auto-select saved printer or first printer if available
        const saved = localStorage.getItem('printnode-selected-printer');
        if (saved && printerList.find(p => p.id === parseInt(saved))) {
          setSelectedPrinterId(parseInt(saved));
        } else if (printerList.length > 0) {
          setSelectedPrinterId(printerList[0].id);
        }
        
        console.log(`PrintNode connected - Found ${printerList.length} printer(s)`);
      } catch (e) {
        console.error("PrintNode connection failed:", e);
        setPrintNodeConnected(false);
      }
    };

    const loadDefaultTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('label_templates')
          .select('*')
          .in('template_type', ['graded', 'raw'])
          .order('is_default', { ascending: false });
        
        if (error) {
          console.error('Failed to load templates:', error);
          return;
        }
        
        const templates: any = {};
        (data || []).forEach((template: any) => {
          // Use the first template (which will be default due to ordering) or the first one found
          if (!templates[template.template_type]) {
            templates[template.template_type] = template;
          }
        });
        
        setDefaultTemplates(templates);
        console.log('Loaded templates for batch printing:', templates);
      } catch (e) {
        console.error('Error loading templates:', e);
      }
    };

    loadBatch();
    loadPrintNode();
    loadDefaultTemplates();
  }, []);

  // Load categories and games for dropdown
  useEffect(() => {
    if (didInitCatsGamesRef.current) return;
    didInitCatsGamesRef.current = true;
    const loadCatsAndGames = async () => {
      const [catsRes, groupsRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name', { ascending: true }),
        supabase.from('groups').select('id, name, category_id').order('name', { ascending: true }),
      ]);

      const catData: any[] = (catsRes as any)?.data || [];
      const grpData: any[] = (groupsRes as any)?.data || [];

      // Categories list (names)
      setCategories(catData.map((d) => d.name).filter(Boolean));

      // Build games with category name
      const catMap = new Map<number, string>();
      catData.forEach((c: any) => catMap.set(c.id, c.name));
      const gameOpts: GameOption[] = grpData.map((g: any) => ({
        id: g.id,
        name: g.name,
        categoryId: g.category_id ?? null,
        categoryName: g.category_id ? catMap.get(g.category_id) ?? null : null,
      }));
      setGames(gameOpts);
    };
    loadCatsAndGames();
  }, []);

  // Listen for Raw Intake additions and update batch in real time
  useEffect(() => {
    if (didInitIntakeListenerRef.current) return;
    didInitIntakeListenerRef.current = true;
    const handler = (e: Event) => {
      const any = e as CustomEvent;
      const row: any = any.detail;
      if (!row) return;
      const next: CardItem = {
        title: buildTitleFromParts(row.year, row.brand_title, row.card_number, row.subject, row.variant),
        set: "",
        year: row.year || "",
        grade: row.grade || "",
        psaCert: row.psa_cert || "",
        price: row?.price != null ? String(row.price) : "",
        cost: row?.cost != null ? String(row.cost) : "",
        lot: row.lot_number || "",
        sku: row.sku || "",
        brandTitle: row.brand_title || "",
        subject: row.subject || "",
        category: row.category || "",
        variant: row.variant || "",
        cardNumber: row.card_number || "",
        id: row.id,
        printedAt: row.printed_at || null,
        pushedAt: row.pushed_at || null,
      };
      if (!next.pushedAt) setBatch((b) => [next, ...b]);
    };

    window.addEventListener("intake:item-added", handler);
    return () => window.removeEventListener("intake:item-added", handler);
  }, []);

  const addToBatch = async () => {
    if (!item.psaCert) {
      toast.error("Please fill Cert Number");
      return;
    }

    const insertPayload = {
      year: item.year || null,
      brand_title: item.brandTitle || null,
      subject: item.subject || null,
      category: item.category || null,
      variant: item.variant || null,
      card_number: item.cardNumber || null,
      grade: item.grade || null,
      psa_cert: item.psaCert || null,
      price: item.price ? Number(item.price) : null,
      cost: item.cost ? Number(item.cost) : null,
      sku: item.sku || item.psaCert || null,
      quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 1,
    };

    try {
      const { data, error } = await supabase
        .from("intake_items")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) throw error;

      const next: CardItem = {
        title:
          buildTitleFromParts(
            data?.year,
            data?.brand_title,
            data?.card_number,
            data?.subject,
            data?.variant
          ) || item.title,
        set: item.set || "",
        player: item.player || "",
        year: data?.year || "",
        grade: data?.grade || "",
        psaCert: data?.psa_cert || "",
        price: data?.price != null ? String(data.price) : "",
        cost: data?.cost != null ? String(data.cost) : "",
        lot: data?.lot_number || "",
        sku: data?.sku || "",
        brandTitle: data?.brand_title || "",
        subject: data?.subject || "",
        category: data?.category || "",
        variant: data?.variant || "",
        labelType: item.labelType || "",
        cardNumber: data?.card_number || "",
        id: data?.id,
        printedAt: data?.printed_at || null,
        pushedAt: data?.pushed_at || null,
      };

      setBatch((b) => [next, ...b]);
      toast.success(`Added to batch (Lot ${next.lot})`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save item");
    }
  };

  const clearForm = () =>
    setItem({
      title: "",
      set: "",
      player: "",
      year: "",
      grade: "",
      psaCert: "",
      price: "",
      cost: "",
      lot: "",
      sku: "",
      brandTitle: "",
      subject: "",
      category: "",
      variant: "",
      labelType: "",
      cardNumber: "",
      quantity: 1,
    });

  const fetchPsa = async (overrideCert?: string) => {
    const cert = (overrideCert || item.psaCert || item.sku || "").trim();
    if (!cert) {
      toast.error("Enter PSA number in SKU or PSA Cert");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("psa-scrape", { body: { cert } });
      if (error) throw error;
      const d: any = data;
      if (!d?.ok) throw new Error(d?.error || "Unknown PSA error");
      setItem((prev) => ({
        ...prev,
        title: [d.year || prev.year, (d.brandTitle || prev.brandTitle || "").replace(/&amp;/g, "&"), (d.cardNumber || prev.cardNumber) ? `#${String(d.cardNumber || prev.cardNumber).replace(/^#/, "")}` : undefined, (d.subject || prev.subject || "").replace(/&amp;/g, "&"), (d.variant || d.varietyPedigree || prev.variant || "").replace(/&amp;/g, "&")].filter(Boolean).join(" ").trim(),
        set: d.set || prev.set,
        player: d.player || prev.player,
        year: d.year || prev.year,
        grade: d.grade || prev.grade,
        psaCert: d.cert || d.certNumber || prev.psaCert,
        sku: prev.sku || d.cert || d.certNumber || prev.psaCert,
        brandTitle: (d.brandTitle || prev.brandTitle || "").replace(/&amp;/g, "&"),
        subject: (d.subject || prev.subject || "").replace(/&amp;/g, "&"),
        category: (d.category || d.game || prev.category || "").replace(/&amp;/g, "&"),
        variant: (d.variant || d.varietyPedigree || prev.variant || "").replace(/&amp;/g, "&"),
        labelType: d.labelType || prev.labelType,
        cardNumber: d.cardNumber || prev.cardNumber,
      }));
      toast.success("PSA details fetched");
    } catch (e) {
      console.error(e);
      toast.error("Failed to fetch PSA details");
    }
  };

  // Helpers to mark items printed/pushed in DB and update UI
  const markPrinted = async (ids: string[]) => {
    if (ids.length === 0) return;
    console.log("Marking printed for ids:", ids);
    const { data, error } = await supabase
      .from("intake_items")
      .update({ printed_at: new Date().toISOString() })
      .in("id", ids)
      .select("id, printed_at");

    if (error) {
      console.error("Failed to mark printed:", error);
      throw error;
    }

    const printedIds = new Set((data || []).map((d: any) => d.id));
    setBatch((prev) =>
      prev.map((b) => (b.id && printedIds.has(b.id) ? { ...b, printedAt: new Date().toISOString() } : b))
    );
  };

  const markPushed = async (ids: string[]) => {
    if (ids.length === 0) return;
    console.log("Marking pushed for ids:", ids);
    const { data, error } = await supabase
      .from("intake_items")
      .update({ pushed_at: new Date().toISOString() })
      .in("id", ids)
      .select("id, pushed_at");

    if (error) {
      console.error("Failed to mark pushed:", error);
      throw error;
    }

    const pushedIds = new Set((data || []).map((d: any) => d.id));
    setBatch((prev) => prev.filter((b) => !(b.id && pushedIds.has(b.id))));
  };

  // Row actions + inline edit
  const startEditRow = (b: CardItem) => {
    if (!b.id) return;
    setEditingId(b.id);
    setEditYear(b.year || "");
    setEditBrandTitle(b.brandTitle || "");
    setEditSubject(b.subject || "");
    setEditCategory(b.category || "");
    setEditVariant(b.variant || "");
    setEditCardNumber(b.cardNumber || "");
    setEditGrade(b.grade || "");
    setEditPsaCert(b.psaCert || "");
    setEditPrice(b.price || "");
    setEditCost(b.cost || "");
    setEditQty(b.quantity ?? 1);
    setEditSku(b.sku || "");
  };

  const cancelEditRow = () => {
    setEditingId(null);
  };

  const saveEditRow = async (b: CardItem) => {
    if (!b.id) return;
    const payload: any = {
      year: editYear || null,
      brand_title: editBrandTitle || null,
      subject: editSubject || null,
      category: editCategory || null,
      variant: editVariant || null,
      card_number: editCardNumber || null,
      grade: editGrade || null,
      psa_cert: editPsaCert || null,
      price: editPrice !== "" ? Number(editPrice) : null,
      cost: editCost !== "" ? Number(editCost) : null,
      quantity: Number(editQty) || 1,
      sku: editSku || null,
    };
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .update(payload)
        .eq('id', b.id)
        .select('*')
        .single();
      if (error) throw error;
      setBatch(prev => prev.map(x => x.id === b.id ? {
        ...x,
        year: data?.year || '',
        brandTitle: data?.brand_title || '',
        subject: data?.subject || '',
        category: data?.category || '',
        variant: data?.variant || '',
        cardNumber: data?.card_number || '',
        grade: data?.grade || '',
        psaCert: data?.psa_cert || '',
        price: data?.price != null ? String(data.price) : '',
        cost: data?.cost != null ? String(data.cost) : '',
        quantity: data?.quantity ?? (Number(editQty) || 1),
        sku: data?.sku || '' ,
        title: buildTitleFromParts(data?.year, data?.brand_title, data?.card_number, data?.subject, data?.variant),
      } : x));
      setEditingId(null);
      toast.success(`Updated Lot ${b.lot || ''}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save changes');
    }
  };

  // Open full details dialog
  const openDetails = (b: CardItem) => {
    if (!b.id) return;
    setDetailsItem(b);
  };

  // Save full details from dialog
  const handleSaveDetails = async (values: {
    id: string;
    year?: string;
    brandTitle?: string;
    subject?: string;
    category?: string;
    variant?: string;
    cardNumber?: string;
    grade?: string;
    psaCert?: string;
    price?: string;
    cost?: string;
    sku?: string;
    quantity?: number;
  }) => {
    try {
      const payload: any = {
        year: values.year || null,
        brand_title: values.brandTitle || null,
        subject: values.subject || null,
        category: values.category || null,
        variant: values.variant || null,
        card_number: values.cardNumber || null,
        grade: values.grade || null,
        psa_cert: values.psaCert || null,
        price: values.price !== undefined && values.price !== "" ? Number(values.price) : null,
        cost: values.cost !== undefined && values.cost !== "" ? Number(values.cost) : null,
        sku: values.sku || null,
        quantity: typeof values.quantity === 'number' ? values.quantity : 1,
      };
      const { data, error } = await supabase
        .from('intake_items')
        .update(payload)
        .eq('id', values.id)
        .select('*')
        .single();
      if (error) throw error;

      setBatch(prev => prev.map(x => x.id === values.id ? {
        ...x,
        year: data?.year || '',
        brandTitle: data?.brand_title || '',
        subject: data?.subject || '',
        category: data?.category || '',
        variant: data?.variant || '',
        cardNumber: data?.card_number || '',
        grade: data?.grade || '',
        psaCert: data?.psa_cert || '',
        price: data?.price != null ? String(data.price) : '',
        cost: data?.cost != null ? String(data.cost) : '',
        sku: data?.sku || '',
        quantity: data?.quantity ?? x.quantity,
        title: buildTitleFromParts(data?.year, data?.brand_title, data?.card_number, data?.subject, data?.variant),
      } : x));

      toast.success('Item updated');
      setDetailsItem(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update item');
    }
  };

  const generateLabelPDF = async (item: CardItem): Promise<string> => {
    const { generateLabelPDF: sharedGenerateLabelPDF } = await import('@/lib/labelRenderer');
    
    // Use Label Designer settings and centralized data mapping
    const { fieldConfig } = getLabelDesignerSettings();
    const labelData = buildLabelDataFromItem(item);

    return sharedGenerateLabelPDF(fieldConfig, labelData, 203);
  };

  const handlePrintRow = async (item: CardItem) => {
    if (!selectedPrinterId) {
      toast.error("No printer selected");
      return;
    }

    if (!item.id) return;
    if (!acquireGlobalLock()) return;
    if (!acquireRowLock(item.id)) { releaseGlobalLock(); return; }

    const formattedTitle = buildTitleFromParts(
      item.year,
      item.brandTitle,
      item.cardNumber,
      item.subject,
      item.variant
    );

        try {
          // Generate PDF for the item
          const pdfBase64 = await generateLabelPDF(item);
          
          // Print via PrintNode PDF
          const result = await printNodeService.printPDF(
            pdfBase64,
            selectedPrinterId,
            { title: `Batch Print - ${formattedTitle}`, copies: 1 }
          );

      if (result.success) {
        setBatch(prev => prev.map(b => 
          b.id === item.id 
            ? { ...b, printedAt: new Date().toISOString() }
            : b
        ));
        await markPrinted([item.id]);
        toast.success(`Printed: ${formattedTitle}`);
      } else {
        throw new Error(result.error || 'Print failed');
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error(`Print failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      releaseRowLock(item.id);
      releaseGlobalLock();
    }
  };

  // Once helper to prevent double export/POST
  function once<T extends (...a: any[]) => any>(fn: T) {
    let called = false;
    return (...args: Parameters<T>): ReturnType<T> | undefined => {
      if (called) return;
      called = true;
      return fn(...args);
    };
  }

  // PDF printing for bulk operations
  const printNodeLabels = async (items: CardItem[]): Promise<boolean> => {
    if (!selectedPrinterId) {
      toast.error('No PrintNode printer selected');
      return false;
    }

    try {
      const printers = await printNodeService.getPrinters();
      const printer = printers.find(p => p.id === selectedPrinterId);
      
      console.log(`=== SENDING TO PRINTNODE PDF ===`);
      console.log(`Printer: ${printer?.name} (ID: ${selectedPrinterId})`);
      console.log(`Pages: ${items.length}`);
      
      let successCount = 0;
      
      for (const item of items) {
        if (!item.id) continue;
        
        const title = buildTitleFromParts(item.year, item.brandTitle, item.cardNumber, item.subject, item.variant);
        
        try {
          // Generate PDF for the item using Label Designer settings
          const pdfBase64 = await generateLabelPDF(item);
          
          // Send to PrintNode
          const result = await printNodeService.printPDF(
            pdfBase64,
            selectedPrinterId,
            {
              title: `Label PDF - ${title}`,
              copies: 1
            }
          );
          
          if (result.success) {
            console.log(`PrintNode Response: Job ID ${result.jobId}`);
            successCount++;
          } else {
            console.error(`PrintNode Error:`, result.error);
            toast.error(`Print failed: ${title}`);
          }
          
        } catch (itemError) {
          console.error(`Error processing item ${item.id}:`, itemError);
          toast.error(`Error printing: ${title}`);
        }
      }
      
      if (successCount > 0) {
        toast.success(`Printed ${successCount} label(s)`);
        return true;
      } else {
        return false;
      }
      
    } catch (e) {
      console.error(e);
      toast.error(`PrintNode print failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      return false;
    }
  };

  // Legacy Fabric/PDF code removed - now using TSPL RAW printing only

  // handlePrintRow is now defined above in the generateLabelPDF section
  const handlePushRow = async (b: CardItem) => {
    if (!b.id) return;
    try {
      const { error } = await supabase.functions.invoke("shopify-import", { body: { itemId: b.id } });
      if (error) throw error;
      await markPushed([b.id]);
      toast.success(`Pushed Lot ${b.lot || ""} to Shopify`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to push");
    }
  };

  const handleDeleteRow = async (b: CardItem) => {
    if (!b.id) return;
    const reason = window.prompt("Delete reason (optional)?") || null;
    try {
      const { error } = await supabase
        .from("intake_items")
        .update({ deleted_at: new Date().toISOString(), deleted_reason: reason })
        .eq("id", b.id);
      if (error) throw error;
      setBatch((prev) => prev.filter((x) => x.id !== b.id));
      toast.success(`Deleted Lot ${b.lot || ""}${reason ? ` (${reason})` : ""}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete item");
    }
  };

  // Bulk actions
  const handlePrintAll = async () => {
    const items = batch.filter(i => i.id) as CardItem[];
    const ids = items.map(i => i.id!) as string[];
    if (ids.length === 0) { toast.info('Nothing to print'); return; }
    if (!printNodeConnected || !selectedPrinterId) { toast.error('PrintNode not connected or no printer selected'); return; }

    if (!acquireGlobalLock()) return;
    setPrintingAll(true);
    try {
      const ok = await printNodeLabels(items);
      if (ok) await markPrinted(ids);
    } catch (e) {
      console.error(e);
      toast.error('Failed to print all');
    } finally {
      setPrintingAll(false);
      releaseGlobalLock();
    }
  };

  const handlePushAll = async () => {
    const ids = batch.map((b) => b.id!).filter(Boolean);
    if (ids.length === 0) {
      toast.info("Nothing to push");
      return;
    }
    setPushingAll(true);
    try {
      // Import each item to Shopify first
      await Promise.all(ids.map((id) => supabase.functions.invoke("shopify-import", { body: { itemId: id } })));
      await markPushed(ids);
      toast.success("Pushed all to Shopify");
    } catch (e) {
      console.error(e);
      toast.error("Failed to push all");
    } finally {
      setPushingAll(false);
    }
  };

  const handlePushAndPrintAll = async () => {
    const items = batch.filter(i => i.id) as CardItem[];
    const ids = items.map(i => i.id!) as string[];
    if (ids.length === 0) { toast.info('Nothing to process'); return; }
    if (!printNodeConnected || !selectedPrinterId) { toast.error('PrintNode not connected or no printer selected'); return; }

    if (!acquireGlobalLock()) return;
    setPushPrintAllRunning(true);
    try {
      // Push stays first
      await Promise.all(ids.map((id) => supabase.functions.invoke("shopify-import", { body: { itemId: id } })));
      await markPushed(ids);

      // Then print
      const ok = await printNodeLabels(items);
      if (ok) await markPrinted(ids);
    } catch (e) {
      console.error(e);
      toast.error('Failed to push and print all');
    } finally {
      setPushPrintAllRunning(false);
      releaseGlobalLock();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Aloha Card Inventory</h1>
          </div>
          <Navigation />
        </div>
      </header>

      <div className="relative overflow-hidden bg-aloha-gradient">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">Dashboard</h2>
            <p className="mt-4 text-lg text-muted-foreground">Centralize PSA-graded cards, batch intake with lot tracking, print barcodes, and sync to Shopify.</p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-6 pb-24">
        <section className="grid md:grid-cols-2 gap-6 mt-8">
          <Card className="shadow-aloha">
            <CardHeader>
              <CardTitle>Raw Cards Intake</CardTitle>
            </CardHeader>
            <CardContent>
              <RawIntake />
            </CardContent>
          </Card>

          <Card className="shadow-aloha">
            <CardHeader>
              <CardTitle>Graded Cards Intake</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-4">
                <Input
                  id="psa-lookup"
                  value={lookupCert}
                  onChange={(e) => setLookupCert(e.target.value)}
                  placeholder="Enter PSA Cert # to fetch details"
                />
                <Button variant="outline" onClick={() => fetchPsa(lookupCert)}>Fetch PSA</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="brandTitle">Brand / Title / Game</Label>
                  <Input id="brandTitle" value={item.brandTitle || ""} onChange={(e) => setItem({ ...item, brandTitle: e.target.value })} placeholder="e.g., POKEMON JAPANESE SWORD & SHIELD..." />
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" value={item.subject || ""} onChange={(e) => setItem({ ...item, subject: e.target.value })} placeholder="e.g., FA/GENGAR VMAX" />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" value={item.category || ""} onChange={(e) => setItem({ ...item, category: e.target.value })} placeholder="e.g., TCG Cards" />
                </div>
                <div>
                  <Label htmlFor="variant">Variant</Label>
                  <Input id="variant" value={item.variant || ""} onChange={(e) => setItem({ ...item, variant: e.target.value })} placeholder="e.g., GENGAR VMAX HIGH-CLS.DK." />
                </div>
                <div>
                  <Label htmlFor="cardNumber">Card Number</Label>
                  <Input id="cardNumber" value={item.cardNumber || ""} onChange={(e) => setItem({ ...item, cardNumber: e.target.value })} placeholder="e.g., 020" />
                </div>
                <div>
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" value={item.year} onChange={(e) => setItem({ ...item, year: e.target.value })} placeholder="e.g., 1999" />
                </div>
                <div>
                  <Label htmlFor="grade">Item Grade</Label>
                  <Input id="grade" value={item.grade} onChange={(e) => setItem({ ...item, grade: e.target.value })} placeholder="e.g., GEM MT 10" />
                </div>
                <div>
                  <Label htmlFor="psa">Cert Number</Label>
                  <Input id="psa" value={item.psaCert} onChange={(e) => setItem({ ...item, psaCert: e.target.value })} placeholder="e.g., 12345678" />
                </div>
                <div>
                  <Label htmlFor="cost">Cost</Label>
                  <Input id="cost" value={item.cost} onChange={(e) => setItem({ ...item, cost: e.target.value })} placeholder="$" />
                </div>
                <div>
                  <Label htmlFor="price">Price</Label>
                  <Input id="price" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} placeholder="$" />
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" type="number" value={String(item.quantity ?? 1)} onChange={(e) => setItem({ ...item, quantity: Number(e.target.value) || 0 })} placeholder="1" />
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Lot number is assigned automatically when you add to batch.
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={addToBatch}>Add to Batch</Button>
                <Button variant="secondary" onClick={clearForm}>Clear</Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-10">
          <Card className="shadow-aloha">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Batch Queue ({batch.length})</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handlePrintAll} disabled={jobInFlight || printingAll || batch.length === 0}>
                    {printingAll ? "Printing…" : "Print All"}
                  </Button>
                  <Button variant="outline" onClick={handlePushAll} disabled={pushingAll || batch.length === 0}>
                    {pushingAll ? "Pushing…" : "Push All"}
                  </Button>
                  <Button onClick={handlePushAndPrintAll} disabled={jobInFlight || pushPrintAllRunning || batch.length === 0}>
                    {pushPrintAllRunning ? "Processing…" : "Push & Print All"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {batch.length === 0 ? (
                <p className="text-muted-foreground">No items yet. Add cards via Quick Intake.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead>Brand/Title</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Card #</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>PSA</TableHead>
                        <TableHead>Lot</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {batch.map((b, i) => (
                         <React.Fragment key={b.id || i}>
                           <TableRow>
                          <TableCell>{b.year}</TableCell>
                          <TableCell>{b.brandTitle}</TableCell>
                          <TableCell>{b.subject}</TableCell>
                          <TableCell>{b.category}</TableCell>
                          <TableCell>{b.variant}</TableCell>
                          <TableCell>{b.cardNumber}</TableCell>
                          <TableCell>{b.grade}</TableCell>
                          <TableCell>{b.psaCert}</TableCell>
                          <TableCell>{b.lot}</TableCell>
                           <TableCell>{formatMoney(b.cost)}</TableCell>
                           <TableCell>{formatMoney(b.price)}</TableCell>
                          <TableCell>{b.quantity ?? 1}</TableCell>
                          <TableCell>{b.sku}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {editingId === b.id ? (
                                <Button size="sm" variant="secondary" onClick={cancelEditRow}>Close</Button>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant={b.printedAt ? "outline" : "default"}
                                    onClick={(e) => { e.stopPropagation(); handlePrintRow(b); }}
                                    disabled={jobInFlight || printingIdsRef.current.has(b.id!)}
                                    title={jobInFlight || printingIdsRef.current.has(b.id!) ? "Print in progress…" : undefined}
                                    className={b.printedAt ? "border-orange-600 text-orange-600 hover:bg-orange-50" : ""}
                                  >
                                    {b.printedAt ? "Reprint" : "Print"}
                                  </Button>
                                   <Dialog>
                                     <DialogTrigger asChild>
                                       <Button size="sm" variant="outline">
                                         <Eye className="h-4 w-4" />
                                       </Button>
                                     </DialogTrigger>
                                      <DialogContent className="max-w-lg">
                                        <DialogHeader>
                                          <DialogTitle>Label Preview</DialogTitle>
                                        </DialogHeader>
                                          <div className="space-y-4">
                                            <PDFLabelPreview item={b} />
                                            <div className="text-xs text-muted-foreground">
                                              This preview is generated from the exact same PDF sent to the printer.
                                            </div>
                                          </div>
                                      </DialogContent>
                                   </Dialog>
                                   <Button size="sm" onClick={() => handlePushRow(b)}>Push</Button>
                                   <Button size="sm" variant="outline" onClick={() => startEditRow(b)}>Edit</Button>
                                   <Button size="sm" variant="destructive" onClick={() => handleDeleteRow(b)}>Delete</Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                          </TableRow>
                          {editingId === b.id && (
                            <TableRow>
                              <TableCell colSpan={15}>
                                <div className="p-4 rounded-md border bg-card">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor={`year-${b.id}`}>Year</Label>
                                      <Input id={`year-${b.id}`} value={editYear} onChange={(e) => setEditYear(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`brand-${b.id}`}>Brand / Title / Game</Label>
                                      <Input id={`brand-${b.id}`} value={editBrandTitle} onChange={(e) => setEditBrandTitle(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`subject-${b.id}`}>Subject</Label>
                                      <Input id={`subject-${b.id}`} value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label>Game</Label>
                                      <Select value={editGameId ? String(editGameId) : ""} onValueChange={(v) => {
                                        const id = Number(v);
                                        setEditGameId(id);
                                        const found = games.find((x) => x.id === id);
                                        setEditCategory(found?.categoryName || "");
                                      }}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select game" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-background z-50">
                                          {games.length === 0 ? (
                                            <SelectItem value="" disabled>No games</SelectItem>
                                          ) : (
                                            games.map((g) => (
                                              <SelectItem key={g.id} value={String(g.id)}>
                                                {g.name}{g.categoryName ? ` (${g.categoryName})` : ""}
                                              </SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label>Category</Label>
                                      <Input value={editCategory} readOnly />
                                    </div>
                                    <div>
                                      <Label htmlFor={`variant-${b.id}`}>Variant</Label>
                                      <Input id={`variant-${b.id}`} value={editVariant} onChange={(e) => setEditVariant(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`cardno-${b.id}`}>Card Number</Label>
                                      <Input id={`cardno-${b.id}`} value={editCardNumber} onChange={(e) => setEditCardNumber(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label>Grade</Label>
                                      <Select value={editGrade || ""} onValueChange={setEditGrade}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select grade" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-background z-50">
                                          {PSA_GRADE_OPTIONS.map((g) => (
                                            <SelectItem key={g} value={g}>{g}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label htmlFor={`psa-${b.id}`}>PSA Cert</Label>
                                      <Input id={`psa-${b.id}`} value={editPsaCert} onChange={(e) => setEditPsaCert(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`cost-${b.id}`}>Cost</Label>
                                      <Input id={`cost-${b.id}`} value={editCost} onChange={(e) => setEditCost(e.target.value)} placeholder="$" />
                                    </div>
                                    <div>
                                      <Label htmlFor={`price-${b.id}`}>Price</Label>
                                      <Input id={`price-${b.id}`} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="$" />
                                    </div>
                                    <div>
                                      <Label htmlFor={`qty-${b.id}`}>Quantity</Label>
                                      <Input id={`qty-${b.id}`} type="number" value={String(editQty)} onChange={(e) => setEditQty(Number(e.target.value) || 0)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`sku-${b.id}`}>SKU</Label>
                                      <Input id={`sku-${b.id}`} value={editSku} onChange={(e) => setEditSku(e.target.value)} />
                                    </div>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <Button onClick={() => saveEditRow(b)}>Save</Button>
                                    <Button variant="secondary" onClick={cancelEditRow}>Cancel</Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                         </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default Index;
