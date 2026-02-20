# Smart Upload Settings Database Schema Design

## Overview

This document outlines the database schema design for a comprehensive Smart Upload settings configuration system. The system manages AI provider configurations, encrypted API keys, model settings, and feature toggles.

## Current Context

### Existing Schema Patterns
- Uses **Prisma** with **MySQL** 
- Uses `cuid()` for primary keys
- Timestamps: `createdAt`, `updatedAt`
- Soft deletes with `deletedAt` where applicable
- Existing models: `SystemSetting`, `AuditLog` for key-value settings and audit trails

### Supported AI Providers
From `docs/AI_PROVIDERS.md`:
- `openai` - OpenAI GPT models
- `anthropic` - Anthropic Claude models
- `gemini` - Google Gemini models
- `openrouter` - OpenRouter aggregator
- `openai_compat` - OpenAI-compatible (Ollama, vLLM)
- `kilo` - Built-in provider
- `custom` - Custom OpenAI-compatible endpoint

---

## Schema Relationship Diagram

``` Design

### Entitymermaid
erDiagram
    SmartUploadSetting ||--o{ AIProvider : contains
    AIProvider ||--o{ APIKey : has
    AIProvider ||--o{ AIModel : supports
    AIModel ||--o{ ModelParameter : configured_with
    SmartUploadSetting ||--o{ SettingsAuditLog : tracked_by
    
    SmartUploadSetting {
        string id
        string key
        string value
        string description
        datetime updatedAt
        string updatedBy
    }
    
    AIProvider {
        string id
        string name
        string displayName
        boolean isEnabled
        string baseUrl
        int sortOrder
        datetime createdAt
        datetime updatedAt
    }
    
    APIKey {
        string id
        string providerId
        string encryptedKey
        boolean isValid
        datetime lastValidated
        datetime createdAt
        string createdBy
    }
    
    AIModel {
        string id
        string providerId
        string modelId
        string displayName
        boolean supportsVision
        boolean supportsStructuredOutput
        boolean isDefault
        datetime lastFetched
        datetime createdAt
    }
    
    ModelParameter {
        string id
        string modelId
        string name
        string paramType
        float defaultValue
        float minValue
        float maxValue
        string stringDefault
    }
    
    SettingsAuditLog {
        string id
        string entityType
        string entityId
        string action
        string oldValue
        string newValue
        string changedBy
        datetime timestamp
    }
```

---

## Prisma Schema Additions

### 1. Feature Toggle - SmartUploadSetting

```prisma
// Smart Upload Feature Settings (key-value approach for flexibility)
model SmartUploadSetting {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String
  description String?
  category    String   @default("general") // general, feature, limits
  isPublic    Boolean  @default(false) // whether visible to non-admins
  updatedAt   DateTime @updatedAt
  updatedBy   String?
  
  @@index([key])
  @@index([category])
}
```

**Usage:**
- `smart_upload.enabled` - boolean "true"/"false" for feature toggle
- `smart_upload.default_provider` - provider ID
- `smart_upload.max_file_size_mb` - numeric limit
- `smart_upload.concurrent_uploads` - batch size

### 2. AI Provider Configuration

```prisma
// AI Provider Configuration
model AIProvider {
  id            String      @id @default(cuid())
  providerId    String      @unique // openai, anthropic, gemini, etc.
  displayName   String
  description   String?
  baseUrl       String?     // Custom endpoint URL
  logoUrl       String?
  isEnabled     Boolean     @default(false)
  isDefault     Boolean     @default(false)
  sortOrder     Int         @default(0)
  capabilities  Json?       // { vision: true, structuredOutput: true }
  
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  // Relations
  apiKeys       APIKey[]
  models        AIModel[]
  
  @@index([isEnabled])
  @@index([sortOrder])
}
```

### 3. API Key Management (Encrypted)

```prisma
// API Keys (encrypted at rest)
model APIKey {
  id              String      @id @default(cuid())
  providerId      String
  keyName         String?     // Optional name for identification
  encryptedKey    String      // AES-256 encrypted API key
  keyHash         String      // SHA-256 hash for validation (never decrypted)
  isValid         Boolean     @default(false)
  validationError String?     // Last validation error
  lastValidated   DateTime?
  expiresAt       DateTime?   // Optional expiration
  isActive        Boolean     @default(true)
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  createdBy       String?
  
  // Relations
  provider        AIProvider  @relation(fields: [providerId], references: [id], onDelete: Cascade)
  
  @@index([providerId])
  @@index([isActive])
}
```

**Security Notes:**
- `encryptedKey` - Encrypted with AES-256-GCM using a master key from environment
- `keyHash` - SHA-256 hash of the decrypted key for validation without storing plaintext
- Never store plaintext API keys

### 4. Model Configuration

```prisma
// Available Models per Provider
model AIModel {
  id                    String      @id @default(cuid())
  providerId            String
  modelId               String      // Provider's model identifier (e.g., gpt-4o-mini)
  displayName           String
  description           String?
  
  // Capabilities
  supportsVision        Boolean     @default(false)
  supportsStructuredOutput Boolean  @default(false)
  supportsStreaming     Boolean     @default(false)
  maxTokens             Int?
  contextWindow         Int?
  
  // Cache management
  lastFetched           DateTime?   // When model list was last fetched
  isAvailable          Boolean     @default(true)
  
  // Default selection
  isDefault             Boolean     @default(false)
  isPreferred           Boolean     @default(false) // User preference
  
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  // Relations
  provider              AIProvider  @relation(fields: [providerId], references: [id], onDelete: Cascade)
  parameters            ModelParameter[]
  
  @@unique([providerId, modelId])
  @@index([providerId])
  @@index([isDefault])
}
```

### 5. Dynamic Model Settings

```prisma
// Configurable Parameters per Model
model ModelParameter {
  id            String    @id @default(cuid())
  modelId       String
  
  // Parameter definition
  name          String    // temperature, max_tokens, top_p, etc.
  displayName   String
  description   String?
  paramType     String    // float, int, string, boolean
  
  // Constraints
  defaultValue  Float?    // For numeric types
  minValue      Float?
  maxValue      Float?
  stringDefault String?   // For string types
  allowedValues Json?     // For enum-like params
  
  // User override
  userValue     Float?
  userStringValue String?
  
  // Metadata
  isAdvanced    Boolean   @default(false)
  isVisible     Boolean   @default(true)
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  model         AIModel   @relation(fields: [modelId], references: [id], onDelete: Cascade)
  
  @@unique([modelId, name])
  @@index([modelId])
}
```

### 6. Settings Audit Trail

```prisma
// Settings Change Audit Log
model SettingsAuditLog {
  id            String    @id @default(cuid())
  
  // What changed
  entityType    String    // SmartUploadSetting, AIProvider, APIKey, AIModel, ModelParameter
  entityId      String
  action        String    // CREATE, UPDATE, DELETE, VALIDATE, ENABLE, DISABLE
  
  // Value changes
  fieldName     String?   // Which field changed (null for entity-level actions)
  oldValue      String?   // JSON serialized
  newValue      String?   // JSON serialized
  
  // Who made the change
  changedBy     String?   // User ID
  ipAddress     String?
  userAgent     String?
  
  timestamp     DateTime  @default(now())
  
  @@index([entityType, entityId])
  @@index([timestamp])
  @@index([changedBy])
}
```

---

## Migration SQL

```sql
-- Smart Upload Settings
CREATE TABLE `SmartUploadSetting` (
  `id` VARCHAR(191) NOT NULL DEFAULT (cuid()),
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  `description` VARCHAR(500),
  `category` VARCHAR(100) NOT NULL DEFAULT 'general',
  `isPublic` BOOLEAN NOT NULL DEFAULT false,
  `updatedAt` DATETIME(3) NOT NULL,
  `updatedBy` VARCHAR(191),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SmartUploadSetting_key_key`(`key`),
  INDEX `SmartUploadSetting_category_idx`(`category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AI Providers
CREATE TABLE `AIProvider` (
  `id` VARCHAR(191) NOT NULL DEFAULT (cuid()),
  `providerId` VARCHAR(100) NOT NULL,
  `displayName` VARCHAR(200) NOT NULL,
  `description` VARCHAR(500),
  `baseUrl` VARCHAR(500),
  `logoUrl` VARCHAR(500),
  `isEnabled` BOOLEAN NOT NULL DEFAULT false,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `capabilities` JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AIProvider_providerId_key`(`providerId`),
  INDEX `AIProvider_isEnabled_idx`(`isEnabled`),
  INDEX `AIProvider_sortOrder_idx`(`sortOrder`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- API Keys
CREATE TABLE `APIKey` (
  `id` VARCHAR(191) NOT NULL DEFAULT (cuid()),
  `providerId` VARCHAR(191) NOT NULL,
  `keyName` VARCHAR(200),
  `encryptedKey` TEXT NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `isValid` BOOLEAN NOT NULL DEFAULT false,
  `validationError` TEXT,
  `lastValidated` DATETIME(3),
  `expiresAt` DATETIME(3),
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `createdBy` VARCHAR(191),
  PRIMARY KEY (`id`),
  INDEX `APIKey_providerId_idx`(`providerId`),
  INDEX `APIKey_isActive_idx`(`isActive`),
  CONSTRAINT `APIKey_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `AIProvider`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AI Models
CREATE TABLE `AIModel` (
  `id` VARCHAR(191) NOT NULL DEFAULT (cuid()),
  `providerId` VARCHAR(191) NOT NULL,
  `modelId` VARCHAR(200) NOT NULL,
  `displayName` VARCHAR(200) NOT NULL,
  `description` VARCHAR(500),
  `supportsVision` BOOLEAN NOT NULL DEFAULT false,
  `supportsStructuredOutput` BOOLEAN NOT NULL DEFAULT false,
  `supportsStreaming` BOOLEAN NOT NULL DEFAULT false,
  `maxTokens` INT,
  `contextWindow` INT,
  `lastFetched` DATETIME(3),
  `isAvailable` BOOLEAN NOT NULL DEFAULT true,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isPreferred` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AIModel_providerId_modelId_key`(`providerId`, `modelId`),
  INDEX `AIModel_providerId_idx`(`providerId`),
  INDEX `AIModel_isDefault_idx`(`isDefault`),
  CONSTRAINT `AIModel_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `AIProvider`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Model Parameters
CREATE TABLE `ModelParameter` (
  `id` VARCHAR(191) NOT NULL DEFAULT (cuid()),
  `modelId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `displayName` VARCHAR(200) NOT NULL,
  `description` VARCHAR(500),
  `paramType` VARCHAR(50) NOT NULL,
  `defaultValue` DOUBLE,
  `minValue` DOUBLE,
  `maxValue` DOUBLE,
  `stringDefault` VARCHAR(500),
  `allowedValues` JSON,
  `userValue` DOUBLE,
  `userStringValue` VARCHAR(500),
  `isAdvanced` BOOLEAN NOT NULL DEFAULT false,
  `isVisible` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ModelParameter_modelId_name_key`(`modelId`, `name`),
  INDEX `ModelParameter_modelId_idx`(`modelId`),
  CONSTRAINT `ModelParameter_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `AIModel`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Settings Audit Log
CREATE TABLE `SettingsAuditLog` (
  `id` VARCHAR(191) NOT NULL DEFAULT (cuid()),
  `entityType` VARCHAR(100) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `fieldName` VARCHAR(100),
  `oldValue` TEXT,
  `newValue` TEXT,
  `changedBy` VARCHAR(191),
  `ipAddress` VARCHAR(50),
  `userAgent` VARCHAR(500),
  `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `SettingsAuditLog_entity_idx`(`entityType`, `entityId`),
  INDEX `SettingsAuditLog_timestamp_idx`(`timestamp`),
  INDEX `SettingsAuditLog_changedBy_idx`(`changedBy`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## TypeScript Interfaces

```typescript
// Smart Upload Setting
export interface SmartUploadSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
  category: 'general' | 'feature' | 'limits';
  isPublic: boolean;
  updatedAt: Date;
  updatedBy?: string;
}

// AI Provider
export interface AIProvider {
  id: string;
  providerId: string; // openai, anthropic, gemini, etc.
  displayName: string;
  description?: string;
  baseUrl?: string;
  logoUrl?: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  capabilities?: {
    vision: boolean;
    structuredOutput: boolean;
    streaming: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// API Key
export interface APIKey {
  id: string;
  providerId: string;
  keyName?: string;
  encryptedKey: string;
  keyHash: string;
  isValid: boolean;
  validationError?: string;
  lastValidated?: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

// AI Model
export interface AIModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  description?: string;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  maxTokens?: number;
  contextWindow?: number;
  lastFetched?: Date;
  isAvailable: boolean;
  isDefault: boolean;
  isPreferred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Model Parameter
export interface ModelParameter {
  id: string;
  modelId: string;
  name: string;
  displayName: string;
  description?: string;
  paramType: 'float' | 'int' | 'string' | 'boolean';
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  stringDefault?: string;
  allowedValues?: string[];
  userValue?: number;
  userStringValue?: string;
  isAdvanced: boolean;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Settings Audit Log
export interface SettingsAuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VALIDATE' | 'ENABLE' | 'DISABLE';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}
```

---

## Design Decisions

### 1. Key-Value Settings Approach
- **Decision:** Use `SmartUploadSetting` with key-value pairs for feature toggles
- **Rationale:** Provides flexibility to add new settings without schema changes
- **Pattern:** Follows existing `SystemSetting` model pattern

### 2. Encrypted API Keys
- **Decision:** Store encrypted key + hash for validation
- **Rationale:** 
  - `encryptedKey` allows retrieval and re-encryption if needed
  - `keyHash` allows validation without exposing plaintext
- **Implementation:** AES-256-GCM encryption with master key from environment

### 3. Normalized Model Configuration
- **Decision:** Separate `AIProvider`, `AIModel`, `ModelParameter` tables
- **Rationale:** 
  - Avoids duplication of provider info
  - Allows dynamic model list updates without code changes
  - Supports per-model parameter customization

### 4. Audit Trail Integration
- **Decision:** Create dedicated `SettingsAuditLog` table
- **Rationale:** 
  - Settings changes need tracking for compliance
  - Dedicated table allows focused queries
  - Includes IP/user agent for security auditing

### 5. Provider Flexibility
- **Decision:** Store `providerId` as string (not enum)
- **Rationale:** Allows adding new providers without migration

---

## Performance Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| SmartUploadSetting | key | Fast lookup by setting key |
| SmartUploadSetting | category | Filter settings by category |
| AIProvider | isEnabled | Find enabled providers |
| AIProvider | sortOrder | Order providers for display |
| APIKey | providerId | Keys for a provider |
| APIKey | isActive | Active key lookup |
| AIModel | providerId | Models for a provider |
| AIModel | isDefault | Find default model |
| ModelParameter | modelId | Parameters for a model |
| SettingsAuditLog | entityType, entityId | Audit history for entity |
| SettingsAuditLog | timestamp | Recent changes |
| SettingsAuditLog | changedBy | Changes by user |

---

## Security Considerations

1. **API Key Encryption:**
   - Use AES-256-GCM for encryption
   - Store master key in environment variable
   - Key rotation support via `expiresAt`

2. **Audit Logging:**
   - Log all sensitive changes (API key modifications, provider toggles)
   - Include IP address and user agent
   - Retain logs for compliance (recommend 1 year)

3. **Access Control:**
   - Settings page restricted to admin roles
   - API key viewing masked by default
   - Validation errors not exposed to end users

4. **Input Validation:**
   - Validate API key format before storage
   - Sanitize all string inputs
   - Use Zod schemas for settings updates
