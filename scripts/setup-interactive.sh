#!/usr/bin/env bash
# Interactive setup for Emerald Coast Community Band platform
# Guides the user through all required and optional environment variables
# Creating or updating .env file with user input or safe defaults

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure graceful exit on Ctrl+C
trap 'echo -e "\n${RED}Setup interrupted by user. Exiting...${NC}"; exit 1' INT TERM

# Bash 4.0+ check for associative arrays (macOS users often have 3.2)
if ((BASH_VERSINFO[0] < 4)); then
  echo -e "${RED}Error: This script requires Bash v4.0 or higher.${NC}"
  echo -e "You are running Bash v${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]}."
  echo -e "If you are on macOS, please update bash (e.g., 'brew install bash') and run the script using the new binary."
  exit 1
fi

# Configuration
ENV_FILE=".env"
ENV_BACKUP="${ENV_FILE}.backup.$(date +%s)"

# Helper function to prompt for input with default
prompt() {
  local var_name="$1"
  local description="$2"
  local default_value="$3"
  local is_secret="${4:-false}"
  local current_value=""

  # Try to get current value from existing .env
  if [ -f "$ENV_FILE" ]; then
    current_value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | sed 's/^"//;s/"$//' || true)
  fi

  # Use current value if exists, otherwise use default
  local display_value="${current_value:-$default_value}"

  # Non-interactive shortcut: return current/default immediately
  if [ "${AUTO_ACCEPT:-false}" = "true" ]; then
    echo "$display_value"
    return
  fi

  echo ""
  echo -e "${CYAN}${var_name}${NC}"
  echo "  Description: $description"
  
  if [ "$is_secret" = "true" ]; then
    echo "  Current: $([ -n "$current_value" ] && echo "***set***" || echo "***not set***")"
  else
    echo "  Current: $display_value"
  fi

  echo -n "  Enter value (or press Enter to use default): "
  # Temporarily disable exit on error for read to allow empty inputs
  set +e
  read -r user_input
  set -e

  # Use user input if provided, otherwise use current or default
  if [ -n "$user_input" ]; then
    echo "$user_input"
  else
    echo "$display_value"
  fi
}

# Helper to validate length
validate_length() {
  local value="$1"
  local min_length="$2"
  local var_name="$3"

  if [ -n "$value" ] && [ "${#value}" -lt "$min_length" ]; then
    echo -e "${RED}Error: $var_name must be at least $min_length characters${NC}" >&2
    return 1
  fi
  return 0
}

# Generate a random secret with a fallback if openssl is missing
generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64
  fi
}

print_header() {
  local title="$1"
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $title${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

# Parse CLI flags
AUTO_ACCEPT=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      AUTO_ACCEPT=true
      ;;
    -h|--help)
      echo "Usage: $0 [--yes|-y]"
      exit 0
      ;;
    *)
      ;;
  esac
done

main() {
  clear
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ECCB Platform - Interactive Environment Setup            ║${NC}"
  echo -e "${GREEN}║  All variables can be customized. Safe defaults provided. ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"

  if [ "$AUTO_ACCEPT" = "true" ]; then
    echo -e "${CYAN}Running in non-interactive mode (auto-accept defaults).${NC}"
  fi

  # Check if .env exists and offer backup
  if [ -f "$ENV_FILE" ]; then
    echo ""
    echo -e "${YELLOW}Found existing $ENV_FILE${NC}"
    echo "A backup will be created at ${ENV_BACKUP}"
    cp "$ENV_FILE" "$ENV_BACKUP"
  fi

  # Declare associative array for all variables
  declare -A ENV_VARS

  # Initialize optional keys to avoid "unbound variable" errors when referenced
  ENV_VARS[SMTP_HOST]=""
  ENV_VARS[SMTP_PORT]=""
  ENV_VARS[SMTP_USER]=""
  ENV_VARS[SMTP_PASSWORD]=""
  ENV_VARS[SMTP_SECURE]=""
  ENV_VARS[S3_ENDPOINT]=""
  ENV_VARS[S3_BUCKET_NAME]=""
  ENV_VARS[S3_REGION]=""
  ENV_VARS[S3_ACCESS_KEY_ID]=""
  ENV_VARS[S3_SECRET_ACCESS_KEY]=""
  ENV_VARS[S3_FORCE_PATH_STYLE]=""
  ENV_VARS[VAPID_PUBLIC_KEY]=""
  ENV_VARS[VAPID_PRIVATE_KEY]=""
  ENV_VARS[LOCAL_STORAGE_PATH]=""
  ENV_VARS[MAX_FILE_SIZE]="52428800"

  # ===========================================================================
  # DATABASE CONFIGURATION
  # ===========================================================================
  print_header "DATABASE CONFIGURATION"
  
  ENV_VARS[DATABASE_URL]=$(prompt "DATABASE_URL" \
    "PostgreSQL connection string" \
    "postgresql://eccb_user:eccb_local_dev_password@localhost:5432/eccb_platform")

  ENV_VARS[DIRECT_URL]=$(prompt "DIRECT_URL" \
    "Direct database URL (for migrations)" \
    "${ENV_VARS[DATABASE_URL]}")

  # ===========================================================================
  # REDIS CONFIGURATION
  # ===========================================================================
  print_header "REDIS CONFIGURATION"

  ENV_VARS[REDIS_URL]=$(prompt "REDIS_URL" \
    "Redis connection URL for caching and job queues" \
    "redis://localhost:6379")

  # ===========================================================================
  # AUTHENTICATION SECRETS
  # ===========================================================================
  print_header "AUTHENTICATION SECRETS"
  echo -e "${YELLOW}These must be at least 32 characters. If left blank, a secure random secret will be generated.${NC}"

  local auth_secret=$(prompt "AUTH_SECRET" \
    "Session encryption secret (min 32 chars)" \
    "" \
    "true")
  
  if [ -z "$auth_secret" ]; then
    echo -e "${CYAN}Generating secure AUTH_SECRET...${NC}"
    auth_secret=$(generate_secret)
  else
    if ! validate_length "$auth_secret" "32" "AUTH_SECRET"; then
      echo -e "${YELLOW}Warning: AUTH_SECRET is less than 32 characters. Consider using a longer value.${NC}"
    fi
  fi
  ENV_VARS[AUTH_SECRET]="$auth_secret"

  local better_auth_secret=$(prompt "BETTER_AUTH_SECRET" \
    "Better Auth encryption secret (min 32 chars)" \
    "" \
    "true")
  
  if [ -z "$better_auth_secret" ]; then
    echo -e "${CYAN}Generating secure BETTER_AUTH_SECRET...${NC}"
    better_auth_secret=$(generate_secret)
  else
    if ! validate_length "$better_auth_secret" "32" "BETTER_AUTH_SECRET"; then
      echo -e "${YELLOW}Warning: BETTER_AUTH_SECRET is less than 32 characters. Consider using a longer value.${NC}"
    fi
  fi
  ENV_VARS[BETTER_AUTH_SECRET]="$better_auth_secret"

  # ===========================================================================
  # AUTHENTICATION URLS
  # ===========================================================================
  print_header "AUTHENTICATION URLS"

  ENV_VARS[AUTH_URL]=$(prompt "AUTH_URL" \
    "Public URL for authentication (http://localhost:3001 for local dev)" \
    "http://localhost:3001")

  ENV_VARS[BETTER_AUTH_URL]=$(prompt "BETTER_AUTH_URL" \
    "Better Auth URL (usually same as AUTH_URL)" \
    "${ENV_VARS[AUTH_URL]}")

  # ===========================================================================
  # SUPER ADMIN CREDENTIALS
  # ===========================================================================
  print_header "SUPER ADMIN CREDENTIALS"
  echo -e "${RED}CRITICAL: These credentials are required before running 'npm run db:seed'${NC}"

  ENV_VARS[SUPER_ADMIN_EMAIL]=$(prompt "SUPER_ADMIN_EMAIL" \
    "Email for the root/super admin account" \
    "admin@eccb.org")

  local super_admin_pass=$(prompt "SUPER_ADMIN_PASSWORD" \
    "Super admin password (min 8 chars, REQUIRED for production)" \
    "" \
    "true")
  
  if [ -z "$super_admin_pass" ]; then
    echo -e "${YELLOW}No super admin password provided. You must set SUPER_ADMIN_PASSWORD before running 'npm run db:seed'${NC}"
  else
    while ! validate_length "$super_admin_pass" "8" "SUPER_ADMIN_PASSWORD"; do
      echo -n "Enter value again: "
      set +e
      read -r super_admin_pass
      set -e
    done
  fi
  ENV_VARS[SUPER_ADMIN_PASSWORD]="$super_admin_pass"

  # ===========================================================================
  # OAUTH PROVIDERS (Optional)
  # ===========================================================================
  print_header "OAUTH PROVIDERS (Optional)"
  echo -e "${YELLOW}Leave blank if not using OAuth${NC}"

  ENV_VARS[GOOGLE_CLIENT_ID]=$(prompt "GOOGLE_CLIENT_ID" \
    "Google OAuth client ID (optional)" \
    "")

  ENV_VARS[GOOGLE_CLIENT_SECRET]=$(prompt "GOOGLE_CLIENT_SECRET" \
    "Google OAuth client secret (optional)" \
    "" \
    "true")

  # ===========================================================================
  # STORAGE CONFIGURATION
  # ===========================================================================
  print_header "STORAGE CONFIGURATION"

  if [ "$AUTO_ACCEPT" = "true" ]; then
    storage_driver_choice="1"
  else
    echo ""
    echo -e "${CYAN}Storage Driver Options:${NC}"
    echo "  1. LOCAL - Files stored on local filesystem (default)"
    echo "  2. S3 - S3-compatible storage (MinIO, AWS S3, Cloudflare R2)"
    echo -n "  Select storage driver [1/2] (default: 1): "
    set +e
    read -r storage_driver_choice
    set -e
  fi
  
  storage_driver_choice="${storage_driver_choice:-1}"

  case "$storage_driver_choice" in
    1)
      ENV_VARS[STORAGE_DRIVER]="LOCAL"
      ENV_VARS[LOCAL_STORAGE_PATH]=$(prompt "LOCAL_STORAGE_PATH" \
        "Path for local file storage" \
        "./storage")
      ;;
    2)
      ENV_VARS[STORAGE_DRIVER]="S3"
      # Clear LOCAL path for S3
      ENV_VARS[LOCAL_STORAGE_PATH]=""
      ;;
    *)
      ENV_VARS[STORAGE_DRIVER]="LOCAL"
      ENV_VARS[LOCAL_STORAGE_PATH]="./storage"
      ;;
  esac

  ENV_VARS[MAX_FILE_SIZE]=$(prompt "MAX_FILE_SIZE" \
    "Maximum file upload size in bytes (52428800 = 50MB)" \
    "52428800")

  # S3 Configuration (if selected)
  if [ "${ENV_VARS[STORAGE_DRIVER]}" = "S3" ]; then
    print_header "S3 STORAGE CONFIGURATION"
    
    ENV_VARS[S3_ENDPOINT]=$(prompt "S3_ENDPOINT" \
      "S3 endpoint URL (http://localhost:9000 for MinIO)" \
      "http://localhost:9000")

    ENV_VARS[S3_BUCKET_NAME]=$(prompt "S3_BUCKET_NAME" \
      "S3 bucket name" \
      "eccb-music")

    ENV_VARS[S3_REGION]=$(prompt "S3_REGION" \
      "S3 region" \
      "us-east-1")

    ENV_VARS[S3_ACCESS_KEY_ID]=$(prompt "S3_ACCESS_KEY_ID" \
      "S3 access key ID" \
      "eccb_admin" \
      "true")

    ENV_VARS[S3_SECRET_ACCESS_KEY]=$(prompt "S3_SECRET_ACCESS_KEY" \
      "S3 secret access key" \
      "" \
      "true")

    ENV_VARS[S3_FORCE_PATH_STYLE]=$(prompt "S3_FORCE_PATH_STYLE" \
      "Use path-style addressing (required for MinIO)" \
      "true")
  fi

  # ===========================================================================
  # EMAIL CONFIGURATION
  # ===========================================================================
  print_header "EMAIL CONFIGURATION"

  if [ "$AUTO_ACCEPT" = "true" ]; then
    email_driver_choice="1"
  else
    echo ""
    echo -e "${CYAN}Email Driver Options:${NC}"
    echo "  1. LOG - Log emails to console (development)"
    echo "  2. SMTP - Send via SMTP server (production)"
    echo "  3. NONE - Disable email (testing)"
    echo -n "  Select email driver [1/2/3] (default: 1): "
    set +e
    read -r email_driver_choice
    set -e
  fi
  
  email_driver_choice="${email_driver_choice:-1}"

  case "$email_driver_choice" in
    1)
      ENV_VARS[EMAIL_DRIVER]="LOG"
      ENV_VARS[SMTP_HOST]=""
      ENV_VARS[SMTP_PORT]=""
      ENV_VARS[SMTP_USER]=""
      ENV_VARS[SMTP_PASSWORD]=""
      ;;
    2)
      ENV_VARS[EMAIL_DRIVER]="SMTP"
      ENV_VARS[SMTP_HOST]=$(prompt "SMTP_HOST" \
        "SMTP server hostname" \
        "smtp.gmail.com")

      ENV_VARS[SMTP_PORT]=$(prompt "SMTP_PORT" \
        "SMTP server port" \
        "587")

      ENV_VARS[SMTP_USER]=$(prompt "SMTP_USER" \
        "SMTP username/email" \
        "")

      ENV_VARS[SMTP_PASSWORD]=$(prompt "SMTP_PASSWORD" \
        "SMTP password" \
        "" \
        "true")

      ENV_VARS[SMTP_SECURE]=$(prompt "SMTP_SECURE" \
        "Use SSL/TLS (true/false)" \
        "false")
      ;;
    3)
      ENV_VARS[EMAIL_DRIVER]="NONE"
      ENV_VARS[SMTP_HOST]=""
      ENV_VARS[SMTP_PORT]=""
      ENV_VARS[SMTP_USER]=""
      ENV_VARS[SMTP_PASSWORD]=""
      ENV_VARS[SMTP_SECURE]=""
      ;;
    *)
      ENV_VARS[EMAIL_DRIVER]="LOG"
      ENV_VARS[SMTP_HOST]=""
      ENV_VARS[SMTP_PORT]=""
      ENV_VARS[SMTP_USER]=""
      ENV_VARS[SMTP_PASSWORD]=""
      ;;
  esac

  ENV_VARS[SMTP_FROM]=$(prompt "SMTP_FROM" \
    "Email sender address" \
    "noreply@eccb.app")

  # ===========================================================================
  # APPLICATION SETTINGS
  # ===========================================================================
  print_header "APPLICATION SETTINGS"

  ENV_VARS[NEXT_PUBLIC_APP_URL]=$(prompt "NEXT_PUBLIC_APP_URL" \
    "Public URL of the application (for links in emails)" \
    "http://localhost:3000")

  ENV_VARS[NEXT_PUBLIC_APP_NAME]=$(prompt "NEXT_PUBLIC_APP_NAME" \
    "Application name displayed in UI" \
    "Emerald Coast Community Band")

  # ===========================================================================
  # ENVIRONMENT
  # ===========================================================================
  print_header "ENVIRONMENT"

  if [ "$AUTO_ACCEPT" = "true" ]; then
    env_choice="1"
  else
    echo ""
    echo -e "${CYAN}Node Environment Options:${NC}"
    echo "  1. development - Local development"
    echo "  2. production - Production server"
    echo "  3. test - Testing environment"
    echo -n "  Select environment [1/2/3] (default: 1): "
    set +e
    read -r env_choice
    set -e
  fi
  
  env_choice="${env_choice:-1}"

  case "$env_choice" in
    1)
      ENV_VARS[NODE_ENV]="development"
      ;;
    2)
      ENV_VARS[NODE_ENV]="production"
      ;;
    3)
      ENV_VARS[NODE_ENV]="test"
      ;;
    *)
      ENV_VARS[NODE_ENV]="development"
      ;;
  esac

  # ===========================================================================
  # PUSH NOTIFICATIONS (Optional)
  # ===========================================================================
  print_header "PUSH NOTIFICATIONS (Optional)"
  echo -e "${YELLOW}Leave blank if not using push notifications${NC}"

  ENV_VARS[VAPID_PUBLIC_KEY]=$(prompt "VAPID_PUBLIC_KEY" \
    "VAPID public key for web push (generate with: npx web-push generate-vapid-keys)" \
    "")

  ENV_VARS[VAPID_PRIVATE_KEY]=$(prompt "VAPID_PRIVATE_KEY" \
    "VAPID private key for web push" \
    "" \
    "true")

  # ===========================================================================
  # VIRUS SCANNING (Optional)
  # ===========================================================================
  print_header "VIRUS SCANNING (Optional)"
  echo -e "${YELLOW}Leave blank if not using ClamAV virus scanning${NC}"

  ENV_VARS[CLAMAV_HOST]=$(prompt "CLAMAV_HOST" \
    "ClamAV daemon hostname" \
    "localhost")

  ENV_VARS[CLAMAV_PORT]=$(prompt "CLAMAV_PORT" \
    "ClamAV daemon port" \
    "3310")

  ENV_VARS[ENABLE_VIRUS_SCAN]=$(prompt "ENABLE_VIRUS_SCAN" \
    "Enable virus scanning (true/false)" \
    "false")

  # ===========================================================================
  # WRITE TO .ENV FILE
  # ===========================================================================
  print_header "WRITING CONFIGURATION"

  # Create new .env file
  {
    echo "# Emerald Coast Community Band - Environment Configuration"
    echo "# Generated by scripts/setup-interactive.sh on $(date)"
    echo ""
    
    echo "# ============================================================================="
    echo "# DATABASE CONFIGURATION"
    echo "# ============================================================================="
    echo "DATABASE_URL=\"${ENV_VARS[DATABASE_URL]}\""
    echo "DIRECT_URL=\"${ENV_VARS[DIRECT_URL]}\""
    echo ""

    echo "# ============================================================================="
    echo "# REDIS CONFIGURATION"
    echo "# ============================================================================="
    echo "REDIS_URL=\"${ENV_VARS[REDIS_URL]}\""
    echo ""

    echo "# ============================================================================="
    echo "# AUTHENTICATION SECRETS"
    echo "# ============================================================================="
    echo "AUTH_SECRET=\"${ENV_VARS[AUTH_SECRET]}\""
    echo "BETTER_AUTH_SECRET=\"${ENV_VARS[BETTER_AUTH_SECRET]}\""
    echo "AUTH_URL=\"${ENV_VARS[AUTH_URL]}\""
    echo "BETTER_AUTH_URL=\"${ENV_VARS[BETTER_AUTH_URL]}\""
    echo ""

    echo "# ============================================================================="
    echo "# SUPER ADMIN CREDENTIALS"
    echo "# ============================================================================="
    echo "SUPER_ADMIN_EMAIL=\"${ENV_VARS[SUPER_ADMIN_EMAIL]}\""
    echo "SUPER_ADMIN_PASSWORD=\"${ENV_VARS[SUPER_ADMIN_PASSWORD]}\""
    echo ""

    echo "# ============================================================================="
    echo "# OAUTH PROVIDERS (Optional)"
    echo "# ============================================================================="
    echo "GOOGLE_CLIENT_ID=\"${ENV_VARS[GOOGLE_CLIENT_ID]}\""
    echo "GOOGLE_CLIENT_SECRET=\"${ENV_VARS[GOOGLE_CLIENT_SECRET]}\""
    echo ""

    echo "# ============================================================================="
    echo "# STORAGE CONFIGURATION"
    echo "# ============================================================================="
    echo "STORAGE_DRIVER=\"${ENV_VARS[STORAGE_DRIVER]}\""
    if [ -n "${ENV_VARS[LOCAL_STORAGE_PATH]}" ]; then
      echo "LOCAL_STORAGE_PATH=\"${ENV_VARS[LOCAL_STORAGE_PATH]}\""
    fi
    echo "MAX_FILE_SIZE=\"${ENV_VARS[MAX_FILE_SIZE]}\""
    echo ""

    if [ "${ENV_VARS[STORAGE_DRIVER]}" = "S3" ]; then
      echo "# ============================================================================="
      echo "# S3 STORAGE CONFIGURATION"
      echo "# ============================================================================="
      echo "S3_ENDPOINT=\"${ENV_VARS[S3_ENDPOINT]}\""
      echo "S3_BUCKET_NAME=\"${ENV_VARS[S3_BUCKET_NAME]}\""
      echo "S3_REGION=\"${ENV_VARS[S3_REGION]}\""
      echo "S3_ACCESS_KEY_ID=\"${ENV_VARS[S3_ACCESS_KEY_ID]}\""
      echo "S3_SECRET_ACCESS_KEY=\"${ENV_VARS[S3_SECRET_ACCESS_KEY]}\""
      echo "S3_FORCE_PATH_STYLE=\"${ENV_VARS[S3_FORCE_PATH_STYLE]}\""
      echo ""
    fi

    echo "# ============================================================================="
    echo "# EMAIL CONFIGURATION"
    echo "# ============================================================================="
    echo "EMAIL_DRIVER=\"${ENV_VARS[EMAIL_DRIVER]}\""
    if [ -n "${ENV_VARS[SMTP_HOST]}" ]; then
      echo "SMTP_HOST=\"${ENV_VARS[SMTP_HOST]}\""
    fi
    if [ -n "${ENV_VARS[SMTP_PORT]}" ]; then
      echo "SMTP_PORT=\"${ENV_VARS[SMTP_PORT]}\""
    fi
    if [ -n "${ENV_VARS[SMTP_USER]}" ]; then
      echo "SMTP_USER=\"${ENV_VARS[SMTP_USER]}\""
    fi
    if [ -n "${ENV_VARS[SMTP_PASSWORD]}" ]; then
      echo "SMTP_PASSWORD=\"${ENV_VARS[SMTP_PASSWORD]}\""
    fi
    if [ -n "${ENV_VARS[SMTP_SECURE]}" ]; then
      echo "SMTP_SECURE=\"${ENV_VARS[SMTP_SECURE]}\""
    fi
    echo "SMTP_FROM=\"${ENV_VARS[SMTP_FROM]}\""
    echo ""

    echo "# ============================================================================="
    echo "# APPLICATION SETTINGS"
    echo "# ============================================================================="
    echo "NEXT_PUBLIC_APP_URL=\"${ENV_VARS[NEXT_PUBLIC_APP_URL]}\""
    echo "NEXT_PUBLIC_APP_NAME=\"${ENV_VARS[NEXT_PUBLIC_APP_NAME]}\""
    echo ""

    echo "# ============================================================================="
    echo "# ENVIRONMENT"
    echo "# ============================================================================="
    echo "NODE_ENV=\"${ENV_VARS[NODE_ENV]}\""
    echo ""

    echo "# ============================================================================="
    echo "# PUSH NOTIFICATIONS (Optional)"
    echo "# ============================================================================="
    if [ -n "${ENV_VARS[VAPID_PUBLIC_KEY]}" ]; then
      echo "VAPID_PUBLIC_KEY=\"${ENV_VARS[VAPID_PUBLIC_KEY]}\""
    fi
    if [ -n "${ENV_VARS[VAPID_PRIVATE_KEY]}" ]; then
      echo "VAPID_PRIVATE_KEY=\"${ENV_VARS[VAPID_PRIVATE_KEY]}\""
    fi
    echo ""

    echo "# ============================================================================="
    echo "# VIRUS SCANNING (Optional)"
    echo "# ============================================================================="
    echo "CLAMAV_HOST=\"${ENV_VARS[CLAMAV_HOST]}\""
    echo "CLAMAV_PORT=\"${ENV_VARS[CLAMAV_PORT]}\""
    echo "ENABLE_VIRUS_SCAN=\"${ENV_VARS[ENABLE_VIRUS_SCAN]}\""
  } > "$ENV_FILE"

  chmod 600 "$ENV_FILE"

  echo -e "${GREEN}✅ Configuration written to $ENV_FILE${NC}"
  if [ -f "$ENV_BACKUP" ]; then
    echo -e "${YELLOW}📦 Backup created at $ENV_BACKUP${NC}"
  fi

  # ===========================================================================
  # FINAL SUMMARY
  # ===========================================================================
  echo ""
  print_header "SETUP COMPLETE"
  echo ""
  echo -e "${GREEN}Your environment is now configured!${NC}"
  echo ""
  echo -e "${CYAN}Next steps:${NC}"
  echo "  1. Review .env file to ensure all values are correct"
  echo "  2. Run database migrations: ${YELLOW}npm run db:migrate${NC}"
  echo "  3. Seed the database: ${YELLOW}npm run db:seed${NC}"
  echo "  4. Start development server: ${YELLOW}npm run dev${NC}"
  echo ""
  echo -e "${YELLOW}Important Security Reminders:${NC}"
  echo "  • Never commit .env to version control"
  echo "  • Keep SUPER_ADMIN_PASSWORD and secrets secure"
  echo "  • Rotate secrets regularly in production"
  echo "  • Review file permissions: chmod 600 .env"
  echo ""
}

# Run main
main