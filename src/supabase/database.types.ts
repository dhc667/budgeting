
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "check_invite_code":
{ Args: { "event": Json }; Returns: Json
                           },
"create_space":
{ Args: { "member_ids": (string)[],"space_name": string }; Returns: string
                           },
"is_space_member":
{ Args: { "space": string }; Returns: boolean
                           },
"schema_version":
{ Args: Record<PropertyKey, never>; Returns: number
                           }
          }
          Enums: {
            "activity_action": "insert"|"update"|"delete","date_format": "day_month_year"|"month_day_year"|"year_month_day","language": "en"|"es-419"|"pt-BR","number_format": "comma_period"|"period_comma"|"space_comma"|"apostrophe_period"
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
            "activity_action": ["insert", "update", "delete"],"date_format": ["day_month_year", "month_day_year", "year_month_day"],"language": ["en", "es-419", "pt-BR"],"number_format": ["comma_period", "period_comma", "space_comma", "apostrophe_period"]
          }
        }
} as const
