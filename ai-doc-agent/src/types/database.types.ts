export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      project_agents: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string;
          connector: string;
          model: string;
          output_mode: string;
          output_type: string;
          skills_markdown: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string;
          connector: string;
          model: string;
          output_mode?: string;
          output_type?: string;
          skills_markdown: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          connector?: string;
          model?: string;
          output_mode?: string;
          output_type?: string;
          skills_markdown?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_agents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_agents_project_connector_fkey";
            columns: ["project_id", "connector"];
            isOneToOne: false;
            referencedRelation: "project_llm_connectors";
            referencedColumns: ["project_id", "connector"];
          },
        ];
      };
      project_repository_groups: {
        Row: {
          id: string;
          project_id: string;
          repository_mode: string;
          name: string;
          description: string;
          repositories: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          repository_mode?: string;
          name: string;
          description?: string;
          repositories: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          repository_mode?: string;
          name?: string;
          description?: string;
          repositories?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_repository_groups_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_llm_connectors: {
        Row: {
          project_id: string;
          connector: string;
          summary: Json;
          credential_ciphertext: string | null;
          credential_nonce: string | null;
          credential_auth_tag: string | null;
          credential_key_version: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          connector: string;
          summary: Json;
          credential_ciphertext?: string | null;
          credential_nonce?: string | null;
          credential_auth_tag?: string | null;
          credential_key_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          summary?: Json;
          credential_ciphertext?: string | null;
          credential_nonce?: string | null;
          credential_auth_tag?: string | null;
          credential_key_version?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_llm_connectors_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_sessions: {
        Row: {
          id: string;
          project_id: string;
          token_hash: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          token_hash: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_sessions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          project_key_hash: string;
          password_hash: string;
          name: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_key_hash: string;
          password_hash: string;
          name: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          password_hash?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      repositories: {
        Row: {
          id: string;
          project_id: string;
          provider: string;
          github_repository_id: string;
          owner: string;
          name: string;
          url: string;
          visibility: string;
          purpose: string;
          default_branch: string;
          token_ciphertext: string | null;
          token_nonce: string | null;
          token_auth_tag: string | null;
          token_key_version: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          provider?: string;
          github_repository_id: string;
          owner: string;
          name: string;
          url: string;
          visibility: string;
          purpose?: string;
          default_branch: string;
          token_ciphertext?: string | null;
          token_nonce?: string | null;
          token_auth_tag?: string | null;
          token_key_version?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          purpose?: string;
          default_branch?: string;
          token_ciphertext?: string | null;
          token_nonce?: string | null;
          token_auth_tag?: string | null;
          token_key_version?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "repositories_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_project_repository: {
        Args: {
          p_default_branch: string;
          p_github_repository_id: string;
          p_name: string;
          p_owner: string;
          p_purpose: string;
          p_repository_id: string;
          p_session_token_hash: string;
          p_token_auth_tag: string | null;
          p_token_ciphertext: string | null;
          p_token_key_version: number | null;
          p_token_nonce: string | null;
          p_url: string;
          p_visibility: string;
        };
        Returns: {
          id: string;
          github_repository_id: string;
          owner: string;
          name: string;
          url: string;
          visibility: string;
          purpose: string;
          default_branch: string;
          has_stored_token: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      access_project: {
        Args: {
          p_project_key_hash: string;
          p_password: string;
        };
        Returns: {
          name: string;
          description: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      create_project: {
        Args: {
          p_name: string;
          p_description: string;
          p_password: string;
          p_project_key_hash: string;
        };
        Returns: {
          created_at: string;
          updated_at: string;
        }[];
      };
      create_project_session: {
        Args: {
          p_password: string;
          p_project_key_hash: string;
          p_session_token_hash: string;
        };
        Returns: {
          project_name: string;
          project_description: string;
          created_at: string;
          updated_at: string;
          expires_at: string;
        }[];
      };
      delete_project: {
        Args: {
          p_project_name: string;
          p_session_token_hash: string;
        };
        Returns: boolean;
      };
      delete_project_repository: {
        Args: {
          p_repository_id: string;
          p_repository_name: string;
          p_session_token_hash: string;
        };
        Returns: boolean;
      };
      update_project_repository: {
        Args: {
          p_purpose: string;
          p_repository_id: string;
          p_session_token_hash: string;
        };
        Returns: {
          id: string;
          github_repository_id: string;
          owner: string;
          name: string;
          url: string;
          visibility: string;
          purpose: string;
          default_branch: string;
          has_stored_token: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      get_project_workspace: {
        Args: {
          p_session_token_hash: string;
        };
        Returns: {
          project_name: string;
          project_description: string;
          created_at: string;
          updated_at: string;
          expires_at: string;
        }[];
      };
      get_repository_secret: {
        Args: {
          p_repository_id: string;
          p_session_token_hash: string;
        };
        Returns: {
          token_ciphertext: string;
          token_nonce: string;
          token_auth_tag: string;
          token_key_version: number;
        }[];
      };
      list_project_repositories: {
        Args: {
          p_session_token_hash: string;
        };
        Returns: {
          id: string;
          github_repository_id: string;
          owner: string;
          name: string;
          url: string;
          visibility: string;
          purpose: string;
          default_branch: string;
          has_stored_token: boolean;
          created_at: string;
          updated_at: string;
        }[];
      };
      list_project_repository_groups: {
        Args: { p_session_token_hash: string };
        Returns: {
          id: string;
          repository_mode: string;
          name: string;
          description: string;
          repositories: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
      save_project_repository_group: {
        Args: {
          p_session_token_hash: string;
          p_group_id: string;
          p_repository_mode: string;
          p_name: string;
          p_description: string;
          p_repositories: Json;
        };
        Returns: {
          id: string;
          repository_mode: string;
          name: string;
          description: string;
          repositories: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
      delete_project_repository_group: {
        Args: { p_session_token_hash: string; p_group_id: string };
        Returns: boolean;
      };
      list_project_llm_connectors: {
        Args: { p_session_token_hash: string };
        Returns: {
          connector: string;
          summary: Json;
          credential_ciphertext: string | null;
          credential_nonce: string | null;
          credential_auth_tag: string | null;
          credential_key_version: number | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      save_project_llm_connector: {
        Args: {
          p_session_token_hash: string;
          p_connector: string;
          p_summary: Json;
          p_credential_ciphertext: string;
          p_credential_nonce: string;
          p_credential_auth_tag: string;
          p_credential_key_version: number;
        };
        Returns: {
          connector: string;
          summary: Json;
          credential_ciphertext: string;
          credential_nonce: string;
          credential_auth_tag: string;
          credential_key_version: number;
          created_at: string;
          updated_at: string;
        }[];
      };
      delete_project_llm_connector: {
        Args: { p_session_token_hash: string; p_connector: string };
        Returns: boolean;
      };
      list_project_agents: {
        Args: { p_session_token_hash: string };
        Returns: {
          id: string;
          name: string;
          description: string;
          connector: string;
          model: string;
          output_mode: string;
          output_type: string;
          skills_markdown: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      save_project_agent: {
        Args: {
          p_session_token_hash: string;
          p_agent_id: string;
          p_name: string;
          p_description: string;
          p_connector: string;
          p_model: string;
          p_output_mode: string;
          p_output_type: string;
          p_skills_markdown: string;
        };
        Returns: {
          id: string;
          name: string;
          description: string;
          connector: string;
          model: string;
          output_mode: string;
          output_type: string;
          skills_markdown: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      delete_project_agent: {
        Args: { p_session_token_hash: string; p_agent_id: string };
        Returns: boolean;
      };
      revoke_project_session: {
        Args: {
          p_session_token_hash: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
