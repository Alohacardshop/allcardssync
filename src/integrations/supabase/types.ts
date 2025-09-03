export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          data: Json | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      games: {
        Row: {
          discovered_at: string | null
          id: string
          name: string
          raw: Json | null
        }
        Insert: {
          discovered_at?: string | null
          id: string
          name: string
          raw?: Json | null
        }
        Update: {
          discovered_at?: string | null
          id?: string
          name?: string
          raw?: Json | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          category_id: number | null
          created_at: string | null
          data: Json | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          category_id?: number | null
          created_at?: string | null
          data?: Json | null
          id: number
          name: string
          updated_at?: string | null
        }
        Update: {
          category_id?: number | null
          created_at?: string | null
          data?: Json | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_items: {
        Row: {
          brand_title: string | null
          card_number: string | null
          catalog_snapshot: Json | null
          category: string | null
          cost: number | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          grade: string | null
          grading_data: Json | null
          id: string
          image_urls: Json | null
          intake_batch_id: string | null
          label_snapshot: Json | null
          lot_id: string | null
          lot_number: string
          original_filename: string | null
          price: number | null
          pricing_snapshot: Json | null
          printed_at: string | null
          processing_notes: string | null
          product_weight: number | null
          psa_cert: string | null
          psa_cert_number: string | null
          psa_last_check: string | null
          psa_snapshot: Json | null
          psa_verified: boolean | null
          pushed_at: string | null
          quantity: number
          removed_from_batch_at: string | null
          shopify_inventory_item_id: string | null
          shopify_location_gid: string | null
          shopify_product_id: string | null
          shopify_snapshot: Json | null
          shopify_variant_id: string | null
          sku: string | null
          source_payload: Json | null
          source_provider: string | null
          source_row_number: number | null
          store_key: string | null
          subject: string | null
          unique_item_uid: string
          updated_at: string
          variant: string | null
          year: string | null
        }
        Insert: {
          brand_title?: string | null
          card_number?: string | null
          catalog_snapshot?: Json | null
          category?: string | null
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          grade?: string | null
          grading_data?: Json | null
          id?: string
          image_urls?: Json | null
          intake_batch_id?: string | null
          label_snapshot?: Json | null
          lot_id?: string | null
          lot_number?: string
          original_filename?: string | null
          price?: number | null
          pricing_snapshot?: Json | null
          printed_at?: string | null
          processing_notes?: string | null
          product_weight?: number | null
          psa_cert?: string | null
          psa_cert_number?: string | null
          psa_last_check?: string | null
          psa_snapshot?: Json | null
          psa_verified?: boolean | null
          pushed_at?: string | null
          quantity?: number
          removed_from_batch_at?: string | null
          shopify_inventory_item_id?: string | null
          shopify_location_gid?: string | null
          shopify_product_id?: string | null
          shopify_snapshot?: Json | null
          shopify_variant_id?: string | null
          sku?: string | null
          source_payload?: Json | null
          source_provider?: string | null
          source_row_number?: number | null
          store_key?: string | null
          subject?: string | null
          unique_item_uid?: string
          updated_at?: string
          variant?: string | null
          year?: string | null
        }
        Update: {
          brand_title?: string | null
          card_number?: string | null
          catalog_snapshot?: Json | null
          category?: string | null
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          grade?: string | null
          grading_data?: Json | null
          id?: string
          image_urls?: Json | null
          intake_batch_id?: string | null
          label_snapshot?: Json | null
          lot_id?: string | null
          lot_number?: string
          original_filename?: string | null
          price?: number | null
          pricing_snapshot?: Json | null
          printed_at?: string | null
          processing_notes?: string | null
          product_weight?: number | null
          psa_cert?: string | null
          psa_cert_number?: string | null
          psa_last_check?: string | null
          psa_snapshot?: Json | null
          psa_verified?: boolean | null
          pushed_at?: string | null
          quantity?: number
          removed_from_batch_at?: string | null
          shopify_inventory_item_id?: string | null
          shopify_location_gid?: string | null
          shopify_product_id?: string | null
          shopify_snapshot?: Json | null
          shopify_variant_id?: string | null
          sku?: string | null
          source_payload?: Json | null
          source_provider?: string | null
          source_row_number?: number | null
          store_key?: string | null
          subject?: string | null
          unique_item_uid?: string
          updated_at?: string
          variant?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "intake_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_lots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lot_number: string
          lot_type: string
          notes: string | null
          processing_data: Json | null
          shopify_location_gid: string | null
          status: string | null
          store_key: string | null
          total_items: number | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_number?: string
          lot_type?: string
          notes?: string | null
          processing_data?: Json | null
          shopify_location_gid?: string | null
          status?: string | null
          store_key?: string | null
          total_items?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lot_number?: string
          lot_type?: string
          notes?: string | null
          processing_data?: Json | null
          shopify_location_gid?: string | null
          status?: string | null
          store_key?: string | null
          total_items?: number | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      item_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          intake_item_id: string
          metadata: Json | null
          snapshot_data: Json
          snapshot_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          intake_item_id: string
          metadata?: Json | null
          snapshot_data: Json
          snapshot_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          intake_item_id?: string
          metadata?: Json | null
          snapshot_data?: Json
          snapshot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_snapshots_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
        ]
      }
      justtcg_analytics_snapshots: {
        Row: {
          captured_at: string
          card_id: string
          card_name: string | null
          change_24h: number | null
          change_30d: number | null
          change_7d: number | null
          cheapest_price: number | null
          game: string
          id: number
          raw: Json | null
        }
        Insert: {
          captured_at?: string
          card_id: string
          card_name?: string | null
          change_24h?: number | null
          change_30d?: number | null
          change_7d?: number | null
          cheapest_price?: number | null
          game: string
          id?: number
          raw?: Json | null
        }
        Update: {
          captured_at?: string
          card_id?: string
          card_name?: string | null
          change_24h?: number | null
          change_30d?: number | null
          change_7d?: number | null
          cheapest_price?: number | null
          game?: string
          id?: number
          raw?: Json | null
        }
        Relationships: []
      }
      justtcg_games: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      justtcg_watchlist: {
        Row: {
          card_id: string
          created_at: string | null
          game: string
          id: number
        }
        Insert: {
          card_id: string
          created_at?: string | null
          game: string
          id?: number
        }
        Update: {
          card_id?: string
          created_at?: string | null
          game?: string
          id?: number
        }
        Relationships: []
      }
      label_templates: {
        Row: {
          canvas: Json
          created_at: string
          data: Json | null
          id: string
          is_default: boolean | null
          name: string
          template_type: string | null
          updated_at: string
        }
        Insert: {
          canvas: Json
          created_at?: string
          data?: Json | null
          id?: string
          is_default?: boolean | null
          name: string
          template_type?: string | null
          updated_at?: string
        }
        Update: {
          canvas?: Json
          created_at?: string
          data?: Json | null
          id?: string
          is_default?: boolean | null
          name?: string
          template_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      label_templates_new: {
        Row: {
          body: string
          id: string
          optional_fields: string[] | null
          required_fields: string[] | null
          updated_at: string
        }
        Insert: {
          body: string
          id: string
          optional_fields?: string[] | null
          required_fields?: string[] | null
          updated_at?: string
        }
        Update: {
          body?: string
          id?: string
          optional_fields?: string[] | null
          required_fields?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      print_jobs: {
        Row: {
          claimed_at: string | null
          copies: number
          created_at: string | null
          data: Json
          error: string | null
          id: string
          printed_at: string | null
          status: string
          target: Json
          template_id: string | null
          template_version: string | null
          tspl_body: string | null
          workstation_id: string
        }
        Insert: {
          claimed_at?: string | null
          copies?: number
          created_at?: string | null
          data: Json
          error?: string | null
          id?: string
          printed_at?: string | null
          status?: string
          target: Json
          template_id?: string | null
          template_version?: string | null
          tspl_body?: string | null
          workstation_id: string
        }
        Update: {
          claimed_at?: string | null
          copies?: number
          created_at?: string | null
          data?: Json
          error?: string | null
          id?: string
          printed_at?: string | null
          status?: string
          target?: Json
          template_id?: string | null
          template_version?: string | null
          tspl_body?: string | null
          workstation_id?: string
        }
        Relationships: []
      }
      printer_settings: {
        Row: {
          bridge_port: number | null
          created_at: string | null
          id: string
          selected_printer_id: number | null
          selected_printer_name: string | null
          updated_at: string | null
          use_printnode: boolean | null
          workstation_id: string
        }
        Insert: {
          bridge_port?: number | null
          created_at?: string | null
          id?: string
          selected_printer_id?: number | null
          selected_printer_name?: string | null
          updated_at?: string | null
          use_printnode?: boolean | null
          workstation_id: string
        }
        Update: {
          bridge_port?: number | null
          created_at?: string | null
          id?: string
          selected_printer_id?: number | null
          selected_printer_name?: string | null
          updated_at?: string | null
          use_printnode?: boolean | null
          workstation_id?: string
        }
        Relationships: []
      }
      product_sync_status: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          product_id: number | null
          shopify_id: string | null
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          product_id?: number | null
          shopify_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          product_id?: number | null
          shopify_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sync_status_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          group_id: number | null
          id: number
          name: string
          tcgcsv_data: Json | null
          tcgplayer_data: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: number | null
          id: number
          name: string
          tcgcsv_data?: Json | null
          tcgplayer_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: number | null
          id?: number
          name?: string
          tcgcsv_data?: Json | null
          tcgplayer_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_sync_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      psa_certificates: {
        Row: {
          brand: string | null
          card_number: string | null
          category: string | null
          cert_number: string
          created_at: string | null
          firecrawl_response: Json | null
          grade: string | null
          id: string
          image_url: string | null
          image_urls: Json | null
          is_valid: boolean
          psa_url: string | null
          raw_html: string | null
          raw_markdown: string | null
          scraped_at: string
          subject: string | null
          updated_at: string | null
          variety_pedigree: string | null
          year: string | null
        }
        Insert: {
          brand?: string | null
          card_number?: string | null
          category?: string | null
          cert_number: string
          created_at?: string | null
          firecrawl_response?: Json | null
          grade?: string | null
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          is_valid?: boolean
          psa_url?: string | null
          raw_html?: string | null
          raw_markdown?: string | null
          scraped_at?: string
          subject?: string | null
          updated_at?: string | null
          variety_pedigree?: string | null
          year?: string | null
        }
        Update: {
          brand?: string | null
          card_number?: string | null
          category?: string | null
          cert_number?: string
          created_at?: string | null
          firecrawl_response?: Json | null
          grade?: string | null
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          is_valid?: boolean
          psa_url?: string | null
          raw_html?: string | null
          raw_markdown?: string | null
          scraped_at?: string
          subject?: string | null
          updated_at?: string | null
          variety_pedigree?: string | null
          year?: string | null
        }
        Relationships: []
      }
      psa_request_log: {
        Row: {
          cert_number: string | null
          created_at: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          response_time_ms: number | null
          success: boolean | null
        }
        Insert: {
          cert_number?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          response_time_ms?: number | null
          success?: boolean | null
        }
        Update: {
          cert_number?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          response_time_ms?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      sets: {
        Row: {
          cards_count: number | null
          discovered_at: string | null
          game: string
          id: string
          name: string
          raw: Json | null
          released_at: string | null
        }
        Insert: {
          cards_count?: number | null
          discovered_at?: string | null
          game: string
          id: string
          name: string
          raw?: Json | null
          released_at?: string | null
        }
        Update: {
          cards_count?: number | null
          discovered_at?: string | null
          game?: string
          id?: string
          name?: string
          raw?: Json | null
          released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sets_game_fkey"
            columns: ["game"]
            isOneToOne: false
            referencedRelation: "game_catalog_stats"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "sets_game_fkey"
            columns: ["game"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_stores: {
        Row: {
          api_version: string | null
          created_at: string | null
          domain: string | null
          key: string
          name: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          api_version?: string | null
          created_at?: string | null
          domain?: string | null
          key: string
          name: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          api_version?: string | null
          created_at?: string | null
          domain?: string | null
          key?: string
          name?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          created_at: string
          game: string
          id: string
          last_error: string | null
          mode: string
          retries: number
          set_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          game: string
          id?: string
          last_error?: string | null
          mode: string
          retries?: number
          set_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          game?: string
          id?: string
          last_error?: string | null
          mode?: string
          retries?: number
          set_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_encrypted: boolean | null
          key_name: string
          key_value: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          key_name: string
          key_value?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          key_name?: string
          key_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trade_ins: {
        Row: {
          card_number: string | null
          condition: string | null
          cost_each: number | null
          created_at: string
          id: string
          language: string | null
          name: string | null
          price_each: number | null
          printing: string | null
          product_id: number | null
          quantity: number | null
          rarity: string | null
          set: string | null
          set_code: string | null
          sku: string | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          card_number?: string | null
          condition?: string | null
          cost_each?: number | null
          created_at?: string
          id?: string
          language?: string | null
          name?: string | null
          price_each?: number | null
          printing?: string | null
          product_id?: number | null
          quantity?: number | null
          rarity?: string | null
          set?: string | null
          set_code?: string | null
          sku?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          card_number?: string | null
          condition?: string | null
          cost_each?: number | null
          created_at?: string
          id?: string
          language?: string | null
          name?: string | null
          price_each?: number | null
          printing?: string | null
          product_id?: number | null
          quantity?: number | null
          rarity?: string | null
          set?: string | null
          set_code?: string | null
          sku?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_shopify_assignments: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          location_gid: string
          location_name: string | null
          store_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          location_gid: string
          location_name?: string | null
          store_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          location_gid?: string
          location_name?: string | null
          store_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_shopify_assignments_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "shopify_stores"
            referencedColumns: ["key"]
          },
        ]
      }
      user_sync_preferences: {
        Row: {
          created_at: string
          force_resync: boolean
          id: string
          last_used_at: string
          only_new_sets: boolean
          selected_games: string[]
          selected_sets: string[]
          sets_game_filter: string
          since_days: number
          skip_recently_updated: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          force_resync?: boolean
          id?: string
          last_used_at?: string
          only_new_sets?: boolean
          selected_games?: string[]
          selected_sets?: string[]
          sets_game_filter?: string
          since_days?: number
          skip_recently_updated?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          force_resync?: boolean
          id?: string
          last_used_at?: string
          only_new_sets?: boolean
          selected_games?: string[]
          selected_sets?: string[]
          sets_game_filter?: string
          since_days?: number
          skip_recently_updated?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      game_catalog_stats: {
        Row: {
          cards_count: number | null
          game_id: string | null
          game_name: string | null
          sets_count: number | null
        }
        Relationships: []
      }
      group_sync_status: {
        Row: {
          category_id: number | null
          id: number | null
          is_fully_synced: boolean | null
          name: string | null
          synced_products: number | null
          total_products: number | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_delete_batch: {
        Args: { lot_id_in: string; reason_in?: string }
        Returns: number
      }
      atomic_catalog_swap: {
        Args: { game_name: string }
        Returns: undefined
      }
      catalog_v2_browse_cards: {
        Args: {
          filter_japanese?: boolean
          game_in: string
          limit_in?: number
          page_in?: number
          rarity_in?: string
          search_in?: string
          set_id_in?: string
          sort_by?: string
          sort_order?: string
        }
        Returns: Json
      }
      catalog_v2_browse_sets: {
        Args: {
          filter_japanese?: boolean
          game_in: string
          limit_in?: number
          page_in?: number
          search_in?: string
          sort_by?: string
          sort_order?: string
        }
        Returns: Json
      }
      catalog_v2_browse_variants: {
        Args: {
          condition_in?: string
          filter_japanese?: boolean
          game_in: string
          language_in?: string
          limit_in?: number
          page_in?: number
          price_max?: number
          price_min?: number
          printing_in?: string
          search_in?: string
          set_id_in?: string
          sort_by?: string
          sort_order?: string
        }
        Returns: Json
      }
      catalog_v2_clear_shadow_for_game: {
        Args: { game_in: string }
        Returns: undefined
      }
      catalog_v2_clear_sync_errors: {
        Args: { before_in?: string; game_in: string }
        Returns: number
      }
      catalog_v2_find_set_id_by_name: {
        Args: { game_in: string; name_in: string }
        Returns: string
      }
      catalog_v2_find_set_name_by_id: {
        Args: { game_in: string; id_in: string }
        Returns: string
      }
      catalog_v2_get_next_queue_item: {
        Args: { game_in: string }
        Returns: {
          game: string
          id: string
          set_id: string
        }[]
      }
      catalog_v2_get_next_queue_item_by_mode: {
        Args: { mode_in: string }
        Returns: {
          game: string
          id: string
          mode: string
          set_id: string
        }[]
      }
      catalog_v2_get_pending_sets_for_game: {
        Args: { game_in: string }
        Returns: {
          name: string
          provider_id: string
        }[]
      }
      catalog_v2_get_recent_sync_errors: {
        Args: { game_in?: string; limit_in?: number }
        Returns: {
          card_id: string
          created_at: string
          message: string
          set_id: string
          step: string
        }[]
      }
      catalog_v2_get_sets_for_backfill: {
        Args: { force_in?: boolean; game_in: string }
        Returns: {
          name: string
          provider_id: string
          set_id: string
        }[]
      }
      catalog_v2_get_stale_sets: {
        Args: { game_in: string; since_timestamp: string }
        Returns: {
          last_seen_at: string
          name: string
          set_id: string
        }[]
      }
      catalog_v2_guardrail_sets_new: {
        Args: { api_sets: Json; game_in: string }
        Returns: {
          not_found: number
          rolled_back: number
        }[]
      }
      catalog_v2_log_error: {
        Args: { payload: Json }
        Returns: undefined
      }
      catalog_v2_mark_queue_item_done: {
        Args: { item_id: string }
        Returns: undefined
      }
      catalog_v2_mark_queue_item_error: {
        Args: { error_message: string; item_id: string; max_retries?: number }
        Returns: undefined
      }
      catalog_v2_pending_sets: {
        Args: { game_in: string; limit_in?: number }
        Returns: {
          name: string
          set_id: string
        }[]
      }
      catalog_v2_queue_pending_sets: {
        Args: { functions_base: string; game_in: string }
        Returns: number
      }
      catalog_v2_queue_pending_sets_by_mode: {
        Args: { filter_japanese?: boolean; game_in: string; mode_in: string }
        Returns: number
      }
      catalog_v2_queue_pending_sets_generic: {
        Args: { function_path: string; functions_base: string; game_in: string }
        Returns: number
      }
      catalog_v2_queue_pending_sets_to_queue: {
        Args: { game_in: string }
        Returns: number
      }
      catalog_v2_queue_stats: {
        Args: { game_in: string }
        Returns: {
          done: number
          error: number
          processing: number
          queued: number
        }[]
      }
      catalog_v2_queue_stats_by_mode: {
        Args: { mode_in: string }
        Returns: {
          done: number
          error: number
          processing: number
          queued: number
        }[]
      }
      catalog_v2_sets_new_null_provider_count: {
        Args: { game_in: string }
        Returns: number
      }
      catalog_v2_stats: {
        Args: { game_in: string }
        Returns: {
          cards_count: number
          pending_count: number
          sets_count: number
        }[]
      }
      catalog_v2_upsert_cards: {
        Args: { rows: Json }
        Returns: undefined
      }
      catalog_v2_upsert_cards_new: {
        Args: { rows: Json }
        Returns: undefined
      }
      catalog_v2_upsert_sets: {
        Args: { rows: Json }
        Returns: undefined
      }
      catalog_v2_upsert_sets_new: {
        Args: { rows: Json }
        Returns: undefined
      }
      catalog_v2_upsert_variants: {
        Args: { rows: Json }
        Returns: undefined
      }
      catalog_v2_upsert_variants_new: {
        Args: { rows: Json }
        Returns: undefined
      }
      claim_next_print_job: {
        Args: { ws: string }
        Returns: {
          claimed_at: string | null
          copies: number
          created_at: string | null
          data: Json
          error: string | null
          id: string
          printed_at: string | null
          status: string
          target: Json
          template_id: string | null
          template_version: string | null
          tspl_body: string | null
          workstation_id: string
        }
      }
      create_raw_intake_item: {
        Args: {
          brand_title_in: string
          card_number_in: string
          catalog_snapshot_in?: Json
          category_in: string
          cost_in: number
          grade_in: string
          price_in: number
          pricing_snapshot_in?: Json
          processing_notes_in?: string
          quantity_in: number
          shopify_location_gid_in: string
          sku_in: string
          source_provider_in?: string
          store_key_in: string
          subject_in: string
          variant_in: string
        }
        Returns: {
          created_at: string
          id: string
          lot_number: string
        }[]
      }
      generate_lot_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_decrypted_secret: {
        Args: { secret_name: string }
        Returns: string
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      http_post_async: {
        Args: { body: Json; headers: Json; url: string }
        Returns: number
      }
      normalize_game_slug: {
        Args: { input_game: string }
        Returns: string
      }
      restore_intake_item: {
        Args: { item_id: string; reason_in?: string }
        Returns: {
          brand_title: string | null
          card_number: string | null
          catalog_snapshot: Json | null
          category: string | null
          cost: number | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          grade: string | null
          grading_data: Json | null
          id: string
          image_urls: Json | null
          intake_batch_id: string | null
          label_snapshot: Json | null
          lot_id: string | null
          lot_number: string
          original_filename: string | null
          price: number | null
          pricing_snapshot: Json | null
          printed_at: string | null
          processing_notes: string | null
          product_weight: number | null
          psa_cert: string | null
          psa_cert_number: string | null
          psa_last_check: string | null
          psa_snapshot: Json | null
          psa_verified: boolean | null
          pushed_at: string | null
          quantity: number
          removed_from_batch_at: string | null
          shopify_inventory_item_id: string | null
          shopify_location_gid: string | null
          shopify_product_id: string | null
          shopify_snapshot: Json | null
          shopify_variant_id: string | null
          sku: string | null
          source_payload: Json | null
          source_provider: string | null
          source_row_number: number | null
          store_key: string | null
          subject: string | null
          unique_item_uid: string
          updated_at: string
          variant: string | null
          year: string | null
        }
      }
      secure_get_secret: {
        Args: { secret_name: string }
        Returns: string
      }
      send_intake_item_to_inventory: {
        Args: { item_id: string }
        Returns: {
          brand_title: string | null
          card_number: string | null
          catalog_snapshot: Json | null
          category: string | null
          cost: number | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          grade: string | null
          grading_data: Json | null
          id: string
          image_urls: Json | null
          intake_batch_id: string | null
          label_snapshot: Json | null
          lot_id: string | null
          lot_number: string
          original_filename: string | null
          price: number | null
          pricing_snapshot: Json | null
          printed_at: string | null
          processing_notes: string | null
          product_weight: number | null
          psa_cert: string | null
          psa_cert_number: string | null
          psa_last_check: string | null
          psa_snapshot: Json | null
          psa_verified: boolean | null
          pushed_at: string | null
          quantity: number
          removed_from_batch_at: string | null
          shopify_inventory_item_id: string | null
          shopify_location_gid: string | null
          shopify_product_id: string | null
          shopify_snapshot: Json | null
          shopify_variant_id: string | null
          sku: string | null
          source_payload: Json | null
          source_provider: string | null
          source_row_number: number | null
          store_key: string | null
          subject: string | null
          unique_item_uid: string
          updated_at: string
          variant: string | null
          year: string | null
        }
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      set_template_default: {
        Args: { template_id: string; template_type_param: string }
        Returns: undefined
      }
      set_user_default_location: {
        Args: { _location_gid: string; _store_key: string }
        Returns: undefined
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      soft_delete_intake_item: {
        Args: { item_id: string; reason_in?: string }
        Returns: {
          brand_title: string | null
          card_number: string | null
          catalog_snapshot: Json | null
          category: string | null
          cost: number | null
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          grade: string | null
          grading_data: Json | null
          id: string
          image_urls: Json | null
          intake_batch_id: string | null
          label_snapshot: Json | null
          lot_id: string | null
          lot_number: string
          original_filename: string | null
          price: number | null
          pricing_snapshot: Json | null
          printed_at: string | null
          processing_notes: string | null
          product_weight: number | null
          psa_cert: string | null
          psa_cert_number: string | null
          psa_last_check: string | null
          psa_snapshot: Json | null
          psa_verified: boolean | null
          pushed_at: string | null
          quantity: number
          removed_from_batch_at: string | null
          shopify_inventory_item_id: string | null
          shopify_location_gid: string | null
          shopify_product_id: string | null
          shopify_snapshot: Json | null
          shopify_variant_id: string | null
          sku: string | null
          source_payload: Json | null
          source_provider: string | null
          source_row_number: number | null
          store_key: string | null
          subject: string | null
          unique_item_uid: string
          updated_at: string
          variant: string | null
          year: string | null
        }
      }
      soft_delete_intake_items: {
        Args: { ids: string[]; reason?: string }
        Returns: Json
      }
      user_can_access_store_location: {
        Args: { _location_gid?: string; _store_key: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
      sync_status: "pending" | "synced" | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
      sync_status: ["pending", "synced", "error"],
    },
  },
} as const
