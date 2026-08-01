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
      project_actions: {
        Row: {
          id: string;
          project_id: string;
          repository_group_id: string;
          pipeline_id: string;
          action_type: string;
          state: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          repository_group_id: string;
          pipeline_id: string;
          action_type?: string;
          state?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          repository_group_id?: string;
          pipeline_id?: string;
          action_type?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_actions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_actions_repository_group_fkey";
            columns: ["project_id", "repository_group_id"];
            isOneToOne: false;
            referencedRelation: "project_repository_groups";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "project_actions_pipeline_fkey";
            columns: ["project_id", "pipeline_id"];
            isOneToOne: false;
            referencedRelation: "project_pipelines";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
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
      project_pipelines: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string;
          default_connector: string;
          default_model: string;
          yaml_definition: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string;
          default_connector: string;
          default_model: string;
          yaml_definition: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          default_connector?: string;
          default_model?: string;
          yaml_definition?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_pipelines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_pipelines_default_connector_fkey";
            columns: ["project_id", "default_connector"];
            isOneToOne: false;
            referencedRelation: "project_llm_connectors";
            referencedColumns: ["project_id", "connector"];
          },
        ];
      };
      project_pipeline_nodes: {
        Row: {
          pipeline_id: string;
          id: string;
          node_kind: string;
          agent_id: string | null;
          position_x: number;
          position_y: number;
          output_config: Json | null;
          input_media_urls: Json;
        };
        Insert: {
          pipeline_id: string;
          id: string;
          node_kind: string;
          agent_id?: string | null;
          position_x: number;
          position_y: number;
          output_config?: Json | null;
          input_media_urls?: Json;
        };
        Update: {
          node_kind?: string;
          agent_id?: string | null;
          position_x?: number;
          position_y?: number;
          output_config?: Json | null;
          input_media_urls?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "project_pipeline_nodes_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "project_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_pipeline_nodes_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "project_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      project_uploads: {
        Row: {
          id: string;
          project_id: string;
          source_pipeline_id: string | null;
          original_file_name: string;
          media_url: string;
          blob_name: string;
          content_type: string;
          size_bytes: number;
          created_at: string;
        };
        Insert: {
          id: string;
          project_id: string;
          source_pipeline_id?: string | null;
          original_file_name: string;
          media_url: string;
          blob_name: string;
          content_type: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: {
          source_pipeline_id?: string | null;
          original_file_name?: string;
          media_url?: string;
          blob_name?: string;
          content_type?: string;
          size_bytes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_uploads_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_uploads_source_pipeline_id_fkey";
            columns: ["source_pipeline_id"];
            isOneToOne: false;
            referencedRelation: "project_pipelines";
            referencedColumns: ["id"];
          },
        ];
      };
      project_pipeline_edges: {
        Row: {
          pipeline_id: string;
          id: string;
          from_node_id: string;
          to_node_id: string;
          source_anchor: string;
        };
        Insert: {
          pipeline_id: string;
          id: string;
          from_node_id: string;
          to_node_id: string;
          source_anchor?: string;
        };
        Update: {
          from_node_id?: string;
          to_node_id?: string;
          source_anchor?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_pipeline_edges_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "project_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_pipeline_edges_from_fkey";
            columns: ["pipeline_id", "from_node_id"];
            isOneToOne: false;
            referencedRelation: "project_pipeline_nodes";
            referencedColumns: ["pipeline_id", "id"];
          },
          {
            foreignKeyName: "project_pipeline_edges_to_fkey";
            columns: ["pipeline_id", "to_node_id"];
            isOneToOne: false;
            referencedRelation: "project_pipeline_nodes";
            referencedColumns: ["pipeline_id", "id"];
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
          project_id: string;
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
      list_project_actions: {
        Args: { p_session_token_hash: string };
        Returns: {
          id: string;
          repository_group_id: string;
          repository_group_name: string;
          pipeline_id: string;
          pipeline_name: string;
          action_type: string;
          state: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      create_project_document_action: {
        Args: {
          p_session_token_hash: string;
          p_repository_group_id: string;
          p_pipeline_id: string;
        };
        Returns: {
          id: string;
          repository_group_id: string;
          repository_group_name: string;
          pipeline_id: string;
          pipeline_name: string;
          action_type: string;
          state: string;
          created_at: string;
          updated_at: string;
        }[];
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
      list_project_pipelines: {
        Args: { p_session_token_hash: string };
        Returns: {
          id: string;
          name: string;
          description: string;
          default_connector: string;
          default_model: string;
          yaml_definition: string;
          nodes: Json;
          edges: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
      list_project_uploads: {
        Args: { p_session_token_hash: string };
        Returns: {
          id: string;
          source_pipeline_id: string | null;
          original_file_name: string;
          media_url: string;
          content_type: string;
          size_bytes: number;
          created_at: string;
        }[];
      };
      save_project_pipeline_with_uploads: {
        Args: {
          p_session_token_hash: string;
          p_pipeline_id: string;
          p_name: string;
          p_description: string;
          p_default_connector: string;
          p_default_model: string;
          p_yaml_definition: string;
          p_nodes: Json;
          p_edges: Json;
          p_node_media: Json;
          p_uploads: Json;
        };
        Returns: {
          id: string;
          name: string;
          description: string;
          default_connector: string;
          default_model: string;
          yaml_definition: string;
          nodes: Json;
          edges: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
      list_project_upload_blob_names: {
        Args: { p_session_token_hash: string };
        Returns: { blob_name: string }[];
      };
      save_project_pipeline: {
        Args: {
          p_session_token_hash: string;
          p_pipeline_id: string;
          p_name: string;
          p_description: string;
          p_default_connector: string;
          p_default_model: string;
          p_yaml_definition: string;
          p_nodes: Json;
          p_edges: Json;
        };
        Returns: {
          id: string;
          name: string;
          description: string;
          default_connector: string;
          default_model: string;
          yaml_definition: string;
          nodes: Json;
          edges: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
      delete_project_pipeline: {
        Args: { p_session_token_hash: string; p_pipeline_id: string };
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
