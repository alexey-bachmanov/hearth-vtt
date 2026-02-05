# Code Style Guide

This guide defines coding standards for HearthVTT. Follow these patterns to maintain consistency and readability across the codebase.

---

## Core Principles

1. **Readability over cleverness** — Code is read far more than it's written
2. **Well-named functions over comments** — `validateCampaignInput()` is clearer than `// validate input`
3. **Extract complexity** — Break monolithic blocks into well-named functions
4. **Document intent** — Comments should explain _why_, not _what_

---

## Documentation Standards

### Class Documentation

Every class must have a documentation block explaining:

- **What** the class does (its responsibility)
- **Why** it exists (its purpose in the system)
- Key architectural constraints (if any)

```typescript
/**
 * SqliteStorage provides persistent storage for campaigns, entities, and events.
 *
 * Architecture:
 * - One metadata.db file tracks all campaigns
 * - Each campaign gets its own database file (campaign-{id}.db)
 * - Connection pooling via Map<campaignId, Database>
 *
 * This separation allows campaigns to be archived/restored independently
 * while maintaining fast access to the campaign list.
 */
export class SqliteStorage implements Storage {
  private dataDir: string;
  private metadataDb: Database | null = null;
  private campaignDbs: Map<string, Database> = new Map();

  // ...
}
```

### Function/Method Documentation

Every public function or method should have a comment block describing:

- **Purpose** — What does it do?
- **Parameters** — What do they mean (if not obvious)?
- **Returns** — What does it return?
- **Side effects** — Does it mutate state, throw errors, do I/O?

```typescript
/**
 * Creates a new campaign with the given name.
 *
 * @param name - Human-readable campaign name (1-200 characters)
 * @returns Campaign object with generated UUID and timestamps
 * @throws {ValidationError} if name is empty or exceeds max length
 *
 * Side effects:
 * - Inserts row into metadata.db
 * - Creates new campaign-{id}.db file
 * - Initializes entities and events tables in new database
 */
async createCampaign(name: string): Promise<Campaign> {
  const trimmedName = name.trim();

  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Campaign name must be 1-200 characters');
  }

  const campaign: Campaign = {
    id: randomUUID(),
    name: trimmedName,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  this.insertCampaignMetadata(campaign);
  this.initializeCampaignDatabase(campaign.id);

  return campaign;
}
```

### Inline Comments for Complex Logic

Use inline comments to explain _why_ something is done a particular way, especially if:

- The logic is non-obvious
- There's a performance consideration
- You're working around a library limitation
- Security/safety is involved

```typescript
// Use Module.createRequire to bypass Node.js SEA's embedderRequire.
// SEA's built-in require() only allows built-in modules, but createRequire
// gives us a real require function that can load external native modules.
const bundleRequire = Module.createRequire(bundlePath);
```

**Avoid** comments that just restate the code:

```typescript
// BAD: Restates what the code already says
// Loop through campaigns
for (const campaign of campaigns) {
  // Delete the campaign
  await this.deleteCampaign(campaign.id);
}

// GOOD: Explains why we're doing it this way
// Delete campaigns in sequence to avoid database lock contention
for (const campaign of campaigns) {
  await this.deleteCampaign(campaign.id);
}
```

---

## Code Organization

### Extract Functions for Clarity

**Bad:** Monolithic block that's hard to follow

```typescript
async function buildExecutable() {
  console.log('Building executable...');

  // Build client
  const clientDir = path.join(rootDir, 'client');
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

  // Bundle server
  const serverEntry = path.join(rootDir, 'server/src/index.ts');
  const bundleResult = await esbuild.build({
    entryPoints: [serverEntry],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/bundle.cjs',
    format: 'cjs',
    external: ['better-sqlite3'],
  });

  if (bundleResult.errors.length > 0) {
    console.error('Bundle errors:', bundleResult.errors);
    process.exit(1);
  }

  // Create launcher
  const launcherCode = `
    const { join } = require('path');
    // ... 50 more lines ...
  `;
  fs.writeFileSync('dist/launcher.cjs', launcherCode);

  // Create SEA config
  const seaConfig = {
    main: 'dist/launcher.cjs',
    output: 'dist/sea-prep.blob',
    disableExperimentalSEAWarning: true,
  };
  fs.writeFileSync('sea-config.json', JSON.stringify(seaConfig, null, 2));

  // Generate blob
  execSync('node --experimental-sea-config sea-config.json', {
    stdio: 'inherit',
  });

  // ... 100 more lines ...
}
```

**Good:** Extracted into well-named functions

```typescript
/**
 * Builds a standalone executable for HearthVTT.
 *
 * Build steps:
 * 1. Build client assets
 * 2. Bundle server code (externalize native modules)
 * 3. Create SEA launcher script
 * 4. Generate SEA blob and inject into Node binary
 * 5. Copy runtime dependencies
 */
async function buildExecutable() {
  console.log('Building HearthVTT executable...');

  await buildClient();
  await bundleServer();
  await createLauncher();
  await generateSeaBlob();
  await injectBlobIntoExecutable();
  await copyRuntimeDependencies();

  console.log('Build complete!');
}

/**
 * Builds the client assets using Vite.
 * Output: client/dist/
 */
async function buildClient() {
  const clientDir = path.join(rootDir, 'client');
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });
}

/**
 * Bundles server TypeScript into a single JavaScript file.
 *
 * @returns Bundled code as a string
 *
 * Note: better-sqlite3 is externalized because native modules
 * cannot be bundled into the SEA blob.
 */
async function bundleServer(): Promise<string> {
  const serverEntry = path.join(rootDir, 'server/src/index.ts');

  const result = await esbuild.build({
    entryPoints: [serverEntry],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/bundle.cjs',
    format: 'cjs',
    external: ['better-sqlite3', 'bindings', 'prebuild-install'],
  });

  if (result.errors.length > 0) {
    throw new Error(`Bundle failed: ${result.errors}`);
  }

  return fs.readFileSync('dist/bundle.cjs', 'utf8');
}

/**
 * Creates the SEA launcher script.
 *
 * The launcher is embedded in the executable and loads the external
 * server bundle. Uses Module.createRequire to enable loading native modules.
 */
async function createLauncher() {
  const launcherCode = generateLauncherCode();
  fs.writeFileSync('dist/launcher.cjs', launcherCode);

  const seaConfig = createSeaConfig('dist/launcher.cjs');
  fs.writeFileSync('sea-config.json', JSON.stringify(seaConfig, null, 2));
}

// ... etc
```

### Readable Business Logic

**Bad:** Hard to understand what's happening

```typescript
const result = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
if (result) {
  const entities = await db
    .prepare('SELECT * FROM entities WHERE campaign_id = ?')
    .all(id);
  result.entities = entities;
  const events = await db
    .prepare('SELECT * FROM events WHERE campaign_id = ?')
    .all(id);
  result.events = events;
  return result;
}
return null;
```

**Good:** Intent is clear from function names

```typescript
const campaign = await storage.getCampaign(id);
if (!campaign) {
  return null;
}

const entities = await storage.getEntities(campaign.id);
const events = await storage.getEvents(campaign.id);

return {
  campaign,
  entities,
  events,
};
```

### Service Layer Example

**Good pattern:** Service methods read like a story

```typescript
/**
 * CampaignService orchestrates campaign-related operations.
 * Validates inputs, coordinates storage, and emits events.
 */
export class CampaignService {
  constructor(
    private storage: Storage,
    private eventBus: EventBus,
  ) {}

  /**
   * Creates a new campaign and notifies subscribers.
   *
   * @param input - Campaign creation parameters
   * @returns Created campaign
   * @throws {ValidationError} if input is invalid
   */
  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    // Validate at the boundary
    const validatedInput = this.validateCampaignInput(input);

    // Create the campaign
    const campaign = await this.storage.createCampaign(validatedInput.name);

    // Initialize default content
    await this.initializeDefaultEntities(campaign.id);

    // Notify subscribers
    this.eventBus.emit('campaign:created', { campaign });

    return campaign;
  }

  /**
   * Validates campaign creation input.
   *
   * @throws {ValidationError} if input doesn't meet requirements
   */
  private validateCampaignInput(input: unknown): CreateCampaignInput {
    if (!input || typeof input !== 'object') {
      throw new ValidationError('Input must be an object');
    }

    const { name } = input as Record<string, unknown>;

    if (typeof name !== 'string') {
      throw new ValidationError('Name must be a string');
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new ValidationError('Name cannot be empty');
    }

    if (trimmedName.length > 200) {
      throw new ValidationError('Name cannot exceed 200 characters');
    }

    return { name: trimmedName };
  }

  /**
   * Sets up default entities for a new campaign.
   * Creates a default scene and starter character templates.
   */
  private async initializeDefaultEntities(campaignId: string): Promise<void> {
    await this.storage.createEntity({
      id: randomUUID(),
      campaignId,
      type: 'scene',
      name: 'Starting Area',
      data: {},
    });
  }
}
```

---

## Naming Conventions

### Classes and Interfaces

- **PascalCase**: `CampaignService`, `Storage`, `SqliteStorage`
- Use nouns: the class/interface represents a _thing_
- Interfaces should describe capability: `Storage`, `EventBus`, `Renderer`
- Implementations can be concrete: `SqliteStorage`, `InMemoryEventBus`, `WebGLRenderer`

### Functions and Methods

- **camelCase**: `createCampaign`, `validateInput`, `getUserById`
- Use verbs: the function _does_ something
- Be specific: `getCampaignById` is clearer than `get`
- Boolean functions start with `is`, `has`, `can`, `should`: `isValid`, `hasPermission`, `canEdit`

```typescript
// Good: Verb phrases that describe actions
async function createCampaign(name: string): Promise<Campaign>;
async function deleteCampaignById(id: string): Promise<void>;
function validateCampaignName(name: string): boolean;
function buildExecutable(): Promise<void>;

// Good: Boolean predicates
function isValidCampaign(campaign: unknown): campaign is Campaign;
function hasPermission(user: User, action: string): boolean;
function canUserEditCampaign(userId: string, campaignId: string): boolean;
```

### Variables

- **camelCase**: `campaignId`, `userInput`, `serverConfig`
- Use descriptive names: `campaign` not `c`, `temporaryBuffer` not `tempBuf`
- Boolean variables like functions: `isValid`, `hasError`, `shouldRetry`
- Constants use **SCREAMING_SNAKE_CASE**: `MAX_CAMPAIGN_NAME_LENGTH`, `DEFAULT_PORT`

```typescript
// Good: Descriptive names
const campaign = await storage.getCampaign(campaignId);
const validatedInput = validateInput(rawInput);
const isReady = checkSystemStatus();

// Constants
const MAX_NAME_LENGTH = 200;
const DEFAULT_DATA_DIR = './data';
```

---

## TypeScript Patterns

### Prefer Explicit Types for Public Interfaces

```typescript
// Good: Function signature is self-documenting
async function createCampaign(
  name: string,
  ownerId: string,
  options?: CampaignOptions,
): Promise<Campaign> {
  // ...
}

// Bad: Unclear what parameters are expected
async function createCampaign(name, owner, opts) {
  // ...
}
```

### Use Type Guards for Validation

```typescript
/**
 * Type guard to check if an unknown value is a valid Campaign.
 */
function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  );
}

// Usage
const data = JSON.parse(input);
if (!isCampaign(data)) {
  throw new ValidationError('Invalid campaign data');
}
// TypeScript now knows 'data' is Campaign
return data;
```

### Error Handling

```typescript
/**
 * Custom error for validation failures.
 * Thrown at API boundaries when input doesn't meet requirements.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Custom error for not-found resources.
 * Results in 404 responses at the HTTP layer.
 */
export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

// Usage in service
async function getCampaign(id: string): Promise<Campaign> {
  const campaign = await storage.getCampaign(id);

  if (!campaign) {
    throw new NotFoundError('Campaign', id);
  }

  return campaign;
}
```

---

## File Organization

### Single Responsibility per File

```
storage/
  index.ts              # Storage interface definitions
  sqlite-storage.ts     # SqliteStorage implementation
  in-memory-storage.ts  # InMemoryStorage (for testing)

services/
  campaign-service.ts   # Campaign orchestration
  entity-service.ts     # Entity operations
  event-service.ts      # Event handling
```

### Index Files as Public API

```typescript
// storage/index.ts - Define public interface
export interface Storage {
  createCampaign(name: string): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  // ...
}

export { Campaign, Entity, Event } from './types';

// Other files shouldn't import implementation details
// Import from the public interface instead:
import { Storage, Campaign } from './storage';
// NOT: import { SqliteStorage } from './storage/sqlite-storage';
```

---

## Testing Patterns

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStorage } from './sqlite-storage';

describe('SqliteStorage', () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    // Arrange: Set up test dependencies
    storage = new SqliteStorage({ dataDir: './test-data' });
    await storage.init();
  });

  afterEach(async () => {
    // Cleanup
    await storage.close();
  });

  describe('createCampaign', () => {
    it('should create a campaign with valid name', async () => {
      // Arrange
      const campaignName = 'Test Campaign';

      // Act
      const campaign = await storage.createCampaign(campaignName);

      // Assert
      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBe(campaignName);
      expect(campaign.createdAt).toBeInstanceOf(Date);
    });

    it('should throw ValidationError for empty name', async () => {
      // Arrange & Act & Assert
      await expect(storage.createCampaign('')).rejects.toThrow(ValidationError);
    });

    it('should create database file for new campaign', async () => {
      // Arrange
      const campaignName = 'File Test Campaign';

      // Act
      const campaign = await storage.createCampaign(campaignName);

      // Assert
      const dbPath = storage.getCampaignDbPath(campaign.id);
      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });
});
```

---

## Template: New Service Class

```typescript
import { Storage } from '../storage';
import { EventBus } from '../events';
import { ValidationError, NotFoundError } from '../errors';

/**
 * [ServiceName] handles [high-level responsibility].
 *
 * Responsibilities:
 * - [Responsibility 1]
 * - [Responsibility 2]
 *
 * Note: [Any important architectural notes or constraints]
 */
export class MyService {
  constructor(
    private storage: Storage,
    private eventBus: EventBus,
  ) {}

  /**
   * [Description of what this method does]
   *
   * @param paramName - What this parameter means
   * @returns What is returned
   * @throws {ValidationError} When input is invalid
   * @throws {NotFoundError} When resource doesn't exist
   */
  async myPublicMethod(paramName: string): Promise<ResultType> {
    // Validate inputs
    this.validateInput(paramName);

    // Orchestrate operations
    const resource = await this.storage.getResource(paramName);
    if (!resource) {
      throw new NotFoundError('Resource', paramName);
    }

    const processedResult = this.processResource(resource);

    // Emit events
    this.eventBus.emit('resource:processed', { result: processedResult });

    return processedResult;
  }

  /**
   * [Description of private helper method]
   */
  private validateInput(input: string): void {
    if (!input || input.trim().length === 0) {
      throw new ValidationError('Input cannot be empty');
    }
  }

  /**
   * [Description of private processing method]
   */
  private processResource(resource: Resource): ProcessedResult {
    // Processing logic here
    return {
      // ...
    };
  }
}
```

---

## Template: New Storage Implementation

```typescript
import Database from 'better-sqlite3';
import { Storage, Campaign, Entity, Event } from './index';
import { randomUUID } from 'crypto';

/**
 * [StorageImpl] provides [storage mechanism] for campaigns and entities.
 *
 * Architecture:
 * - [Key architectural decision 1]
 * - [Key architectural decision 2]
 *
 * Constraints:
 * - [Any performance or concurrency constraints]
 */
export class MyStorage implements Storage {
  private dataDir: string;
  private db: Database | null = null;

  constructor(options: { dataDir: string }) {
    this.dataDir = options.dataDir;
  }

  /**
   * Initializes the storage system.
   * Must be called before any other operations.
   *
   * Side effects:
   * - Creates data directory if it doesn't exist
   * - Opens database connection
   * - Runs schema migrations
   */
  async init(): Promise<void> {
    await this.ensureDataDirectory();
    this.openDatabase();
    this.runMigrations();
  }

  /**
   * Creates a new campaign.
   *
   * @param name - Campaign name (1-200 characters)
   * @returns Created campaign with generated ID
   * @throws {ValidationError} if name is invalid
   */
  async createCampaign(name: string): Promise<Campaign> {
    this.validateCampaignName(name);

    const campaign: Campaign = {
      id: randomUUID(),
      name: name.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.insertCampaign(campaign);

    return campaign;
  }

  /**
   * Retrieves a campaign by ID.
   *
   * @param id - Campaign UUID
   * @returns Campaign if found, null otherwise
   */
  async getCampaign(id: string): Promise<Campaign | null> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }

    const row = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);

    return row ? this.rowToCampaign(row) : null;
  }

  /**
   * Validates campaign name meets requirements.
   *
   * @throws {ValidationError} if name is invalid
   */
  private validateCampaignName(name: string): void {
    const trimmed = name.trim();

    if (trimmed.length === 0) {
      throw new ValidationError('Campaign name cannot be empty');
    }

    if (trimmed.length > 200) {
      throw new ValidationError('Campaign name cannot exceed 200 characters');
    }
  }

  /**
   * Converts a database row to a Campaign object.
   */
  private rowToCampaign(row: any): Campaign {
    return {
      id: row.id,
      name: row.name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ... more methods
}
```

---

## Summary Checklist

Before submitting code, verify:

- [ ] All classes have documentation blocks
- [ ] All public functions have documentation blocks
- [ ] Complex logic has inline comments explaining _why_
- [ ] Functions are extracted (not monolithic blocks)
- [ ] Function names describe what they do
- [ ] Variable names are descriptive
- [ ] No "TODO" or "FIXME" comments without associated tickets
- [ ] Error cases are handled explicitly
- [ ] Tests exist for new functionality (if applicable)
