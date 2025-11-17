import { Link, useLocation } from "react-router-dom"
import { 
  Home, 
  Package, 
  Archive, 
  Settings, 
  FileText,
  Printer
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"

export function MobileBottomNav() {
  const location = useLocation()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data } = await supabase.rpc("has_role", { 
            _user_id: session.user.id, 
            _role: "admin" as any 
          })
          setIsAdmin(Boolean(data))
        }
      } catch (error) {
        setIsAdmin(false)
      }
    }

    checkAdminStatus()
  }, [])

  const navItems = [
    { to: "/", label: "Home", icon: Home },
    { to: "/inventory", label: "Inventory", icon: Package },
    { to: "/batches", label: "Batches", icon: Archive },
    { to: "/barcode-printing", label: "Barcode Printing", icon: Printer },
    { to: "/shopify-mapping", label: "Shopify", icon: FileText },
  ]

  if (isAdmin) {
    navItems.push({ to: "/admin", label: "Admin", icon: Settings })
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 md:hidden">
      <nav className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.to)
          
          return (
            <Link 
              key={item.to} 
              to={item.to}
              className={`
                flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg
                transition-all duration-200 min-w-[60px] relative
                ${active 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
              `}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-primary' : ''}`} />
              <span className={`text-xs font-medium ${active ? 'text-primary' : ''}`}>
                {item.label}
              </span>
              
              {/* Active indicator */}
              {active && (
                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
              )}
              
              {/* Admin badge */}
              {item.label === "Admin" && (
                <Badge 
                  variant="secondary" 
                  className="absolute -top-1 -right-1 text-xs px-1.5 py-0.5 h-5"
                >
                  A
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}