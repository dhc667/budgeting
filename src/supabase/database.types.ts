
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity": {
                  Row: {
                    "action": Database["public"]['Enums']["activity_action"],"changed_at": string,"changed_by": string | null,"id": number,"new": Json | null,"old": Json | null,"row_id": string,"space_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["activity_action"],"changed_at"?: string,"changed_by"?: string | null,"id"?: never,"new"?: Json | null,"old"?: Json | null,"row_id": string,"space_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["activity_action"],"changed_at"?: string,"changed_by"?: string | null,"id"?: never,"new"?: Json | null,"old"?: Json | null,"row_id"?: string,"space_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_changed_by_profiles_id_fk"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_space_id_spaces_id_fk"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"currencies": {
                  Row: {
                    "code": string,"decimals": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"decimals": number
                  }
                  Update: {
                    "code"?: string,"decimals"?: number
                  }
                  Relationships: [
                    
                  ]
                },"invite_codes": {
                  Row: {
                    "code_hash": string,"created_at": string,"expires_at": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"expires_at": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"expires_at"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ledger_accounts": {
                  Row: {
                    "archived": boolean,"color": Database["public"]['Enums']["color"] | null,"created_at": string,"currency": string | null,"id": string,"kind": Database["public"]['Enums']["ledger_account_kind"],"name": string | null,"position": number,"space_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"color"?: Database["public"]['Enums']["color"] | null,"created_at"?: string,"currency"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["ledger_account_kind"],"name"?: string | null,"position"?: number,"space_id": string
                  }
                  Update: {
                    "archived"?: boolean,"color"?: Database["public"]['Enums']["color"] | null,"created_at"?: string,"currency"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["ledger_account_kind"],"name"?: string | null,"position"?: number,"space_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_accounts_currency_currencies_code_fk"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "ledger_accounts_space_id_spaces_id_fk"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"postings": {
                  Row: {
                    "amount": number,"currency": string,"id": string,"ledger_account_id": string,"transaction_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"currency": string,"id"?: string,"ledger_account_id": string,"transaction_id": string
                  }
                  Update: {
                    "amount"?: number,"currency"?: string,"id"?: string,"ledger_account_id"?: string,"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "postings_currency_currencies_code_fk"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "postings_ledger_account_id_ledger_accounts_id_fk"
      columns: ["ledger_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "postings_ledger_account_id_ledger_accounts_id_fk"
      columns: ["ledger_account_id"]
isOneToOne: false
      referencedRelation: "ledger_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "postings_transaction_id_transactions_id_fk"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"date_format": Database["public"]['Enums']["date_format"] | null,"display_currency": string,"display_name": string,"id": string,"language": Database["public"]['Enums']["language"] | null,"number_format": Database["public"]['Enums']["number_format"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date_format"?: Database["public"]['Enums']["date_format"] | null,"display_currency"?: string,"display_name": string,"id": string,"language"?: Database["public"]['Enums']["language"] | null,"number_format"?: Database["public"]['Enums']["number_format"] | null
                  }
                  Update: {
                    "created_at"?: string,"date_format"?: Database["public"]['Enums']["date_format"] | null,"display_currency"?: string,"display_name"?: string,"id"?: string,"language"?: Database["public"]['Enums']["language"] | null,"number_format"?: Database["public"]['Enums']["number_format"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_display_currency_currencies_code_fk"
      columns: ["display_currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    }
                  ]
                },"space_members": {
                  Row: {
                    "created_at": string,"id": string,"space_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"space_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"space_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_members_space_id_spaces_id_fk"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "space_members_user_id_profiles_id_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"spaces": {
                  Row: {
                    "created_at": string,"id": string,"name": string | null,"private_owner": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"private_owner"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"private_owner"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "spaces_private_owner_profiles_id_fk"
      columns: ["private_owner"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "created_at": string,"created_by": string,"date": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"date": string,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"date"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_created_by_profiles_id_fk"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "accounts": {
                  Row: {
                    "archived": boolean | null,"balance": number | null,"color": Database["public"]['Enums']["color"] | null,"created_at": string | null,"currency": string | null,"has_transactions": boolean | null,"id": string | null,"name": string | null,"opening_balance": number | null,"opening_date": string | null,"position": number | null,"space_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "archived"?: boolean | null,"balance"?: never,"color"?: Database["public"]['Enums']["color"] | null,"created_at"?: string | null,"currency"?: string | null,"has_transactions"?: never,"id"?: string | null,"name"?: string | null,"opening_balance"?: never,"opening_date"?: never,"position"?: number | null,"space_id"?: string | null
                         }
                        Update: {
                           "archived"?: boolean | null,"balance"?: never,"color"?: Database["public"]['Enums']["color"] | null,"created_at"?: string | null,"currency"?: string | null,"has_transactions"?: never,"id"?: string | null,"name"?: string | null,"opening_balance"?: never,"opening_date"?: never,"position"?: number | null,"space_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "ledger_accounts_currency_currencies_code_fk"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "ledger_accounts_space_id_spaces_id_fk"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "spaces"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "account_history":
{ Args: { "account_id": string }; Returns: {
              "action": Database["public"]['Enums']["activity_action"],
"changed_at": string,
"changed_by": string | null,
"id": number,
"new": Json | null,
"old": Json | null,
"row_id": string,
"space_id": string,
"table_name": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "activity"
        isOneToOne: false
        isSetofReturn: true
      } },
"check_invite_code":
{ Args: { "event": Json }; Returns: Json
                           },
"check_opening_date":
{ Args: { "opening_date": string }; Returns: undefined
                           },
"create_account":
{ Args: { "account_color": Database["public"]['Enums']["color"],"account_currency": string,"account_name": string,"opening_amount": number,"opening_date": string,"space": string }; Returns: string
                           },
"create_space":
{ Args: { "member_ids": (string)[],"space_name": string }; Returns: string
                           },
"is_opening_balance":
{ Args: { "transaction": string }; Returns: boolean
                           },
"is_space_member":
{ Args: { "space": string }; Returns: boolean
                           },
"log_transaction":
{ Args: { "action": Database["public"]['Enums']["activity_action"],"new_snapshot": Json,"old_snapshot": Json,"space": string,"transaction": string }; Returns: undefined
                           },
"reorder_accounts":
{ Args: { "account_ids": (string)[] }; Returns: undefined
                           },
"schema_version":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"set_opening_balance":
{ Args: { "account": Omit<Database["public"]['Tables']["ledger_accounts"]['Row'], Database["public"]['Tables']["ledger_accounts"]['ComputedFields']>,"opening_amount": number,"opening_date": string }; Returns: undefined
                           },
"transaction_snapshot":
{ Args: { "transaction": string }; Returns: Json
                           },
"update_account":
{ Args: { "account_color": Database["public"]['Enums']["color"],"account_currency": string,"account_id": string,"account_name": string,"opening_amount": number,"opening_date": string }; Returns: undefined
                           }
          }
          Enums: {
            "activity_action": "insert"|"update"|"delete","color": "red"|"orange"|"amber"|"lime"|"green"|"teal"|"cyan"|"blue"|"indigo"|"violet"|"pink"|"slate","date_format": "day_month_year"|"month_day_year"|"year_month_day","language": "en"|"es-419"|"pt-BR","ledger_account_kind": "account"|"expense"|"income"|"opening_balance","number_format": "comma_period"|"period_comma"|"space_comma"|"apostrophe_period"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activity_action": ["insert", "update", "delete"],"color": ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "pink", "slate"],"date_format": ["day_month_year", "month_day_year", "year_month_day"],"language": ["en", "es-419", "pt-BR"],"ledger_account_kind": ["account", "expense", "income", "opening_balance"],"number_format": ["comma_period", "period_comma", "space_comma", "apostrophe_period"]
          }
        }
} as const
