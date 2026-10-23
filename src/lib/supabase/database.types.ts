
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"assignments": {
                  Row: {
                    "created_at": string,"event_id": string,"giver_id": string,"receiver_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"giver_id": string,"receiver_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"giver_id"?: string,"receiver_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_giver_fk"
      columns: ["giver_id","event_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","event_id"]
    },{
      foreignKeyName: "assignments_receiver_fk"
      columns: ["receiver_id","event_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","event_id"]
    }
                  ]
                },"events": {
                  Row: {
                    "budget": string | null,"closed_at": string | null,"cover_path": string | null,"created_at": string,"created_by": string | null,"description": string | null,"drawn_at": string | null,"exchange_date": string | null,"id": string,"name": string,"published_at": string | null,"signup_open": boolean,"signup_token": string | null,"status": Database["public"]['Enums']["event_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget"?: string | null,"closed_at"?: string | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"drawn_at"?: string | null,"exchange_date"?: string | null,"id"?: string,"name": string,"published_at"?: string | null,"signup_open"?: boolean,"signup_token"?: string | null,"status"?: Database["public"]['Enums']["event_status"],"updated_at"?: string
                  }
                  Update: {
                    "budget"?: string | null,"closed_at"?: string | null,"cover_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"drawn_at"?: string | null,"exchange_date"?: string | null,"id"?: string,"name"?: string,"published_at"?: string | null,"signup_open"?: boolean,"signup_token"?: string | null,"status"?: Database["public"]['Enums']["event_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exclusions": {
                  Row: {
                    "created_at": string,"event_id": string,"giver_id": string,"id": string,"receiver_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"giver_id": string,"id"?: string,"receiver_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"giver_id"?: string,"id"?: string,"receiver_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exclusions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exclusions_giver_fk"
      columns: ["giver_id","event_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","event_id"]
    },{
      foreignKeyName: "exclusions_receiver_fk"
      columns: ["receiver_id","event_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","event_id"]
    }
                  ]
                },"invite_tokens": {
                  Row: {
                    "created_at": string,"participant_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"participant_id": string,"token": string
                  }
                  Update: {
                    "created_at"?: string,"participant_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invite_tokens_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: true
      referencedRelation: "participants"
      referencedColumns: ["id"]
    }
                  ]
                },"participants": {
                  Row: {
                    "avatar": string,"created_at": string,"email": string | null,"event_id": string,"id": string,"invite_method": string | null,"invited_at": string | null,"name": string,"opened_at": string | null,"photo_path": string | null,"revealed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar"?: string,"created_at"?: string,"email"?: string | null,"event_id": string,"id"?: string,"invite_method"?: string | null,"invited_at"?: string | null,"name": string,"opened_at"?: string | null,"photo_path"?: string | null,"revealed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar"?: string,"created_at"?: string,"email"?: string | null,"event_id"?: string,"id"?: string,"invite_method"?: string | null,"invited_at"?: string | null,"name"?: string,"opened_at"?: string | null,"photo_path"?: string | null,"revealed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participants_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assert_photo_available":
{ Args: { "p_event_id": string,"p_participant_id": string,"p_photo_path": string }; Returns: undefined
                           },
"close_event":
{ Args: { "p_event_id": string }; Returns: undefined
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"generate_invite_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"owns_event":
{ Args: { "p_event_id": string }; Returns: boolean
                           },
"owns_photo_path":
{ Args: { "p_name": string }; Returns: boolean
                           },
"participant_mark_emailed":
{ Args: { "p_token": string }; Returns: undefined
                           },
"participant_profile":
{ Args: { "p_token": string }; Returns: {
              "can_edit": boolean,"event_id": string,"participant_avatar": string,"participant_name": string,"participant_photo_path": string
            }[]
                           },
"participant_reveal":
{ Args: { "p_token": string }; Returns: {
              "event_status": Database["public"]['Enums']["event_status"],"recipient_avatar": string,"recipient_name": string,"recipient_photo_path": string
            }[]
                           },
"participant_status":
{ Args: { "p_token": string }; Returns: {
              "event_budget": string,"event_cover_path": string,"event_description": string,"event_exchange_date": string,"event_name": string,"event_status": Database["public"]['Enums']["event_status"],"has_revealed": boolean,"participant_name": string
            }[]
                           },
"participant_update_profile":
{ Args: { "p_avatar": string,"p_name": string,"p_photo_path"?: string,"p_remove_photo"?: boolean,"p_token": string }; Returns: undefined
                           },
"photo_upload_allowed":
{ Args: { "p_name": string }; Returns: boolean
                           },
"publish_event":
{ Args: { "p_event_id": string }; Returns: undefined
                           },
"regenerate_invite_token":
{ Args: { "p_participant_id": string }; Returns: string
                           },
"regenerate_signup_token":
{ Args: { "p_event_id": string }; Returns: string
                           },
"register_participant":
{ Args: { "p_avatar": string,"p_email": string,"p_name": string,"p_photo_path"?: string,"p_token": string }; Returns: string
                           },
"reset_draw":
{ Args: { "p_confirmation"?: string,"p_event_id": string }; Returns: undefined
                           },
"save_draw":
{ Args: { "p_event_id": string,"p_pairs": Json }; Returns: undefined
                           },
"set_signup_open":
{ Args: { "p_event_id": string,"p_open": boolean }; Returns: string
                           },
"signup_info":
{ Args: { "p_token": string }; Returns: {
              "event_budget": string,"event_cover_path": string,"event_description": string,"event_exchange_date": string,"event_id": string,"event_name": string,"is_open": boolean
            }[]
                           }
          }
          Enums: {
            "event_status": "DRAFT"|"DRAWN"|"PUBLISHED"|"CLOSED"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "event_status": ["DRAFT", "DRAWN", "PUBLISHED", "CLOSED"]
          }
        }
} as const
