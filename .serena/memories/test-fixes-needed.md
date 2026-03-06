Issues found in commit-idempotency tests:

1. Mock state is being shared between tests - need to use vi.resetAllMocks() more aggressively
2. The findUnique mock is being called multiple times in some tests and needs proper chaining
3. Tests that check specific error messages need to match exact error text
4. Some transaction failure tests are sharing mock error states
5. Need to ensure prisma.smartUploadSession.update is properly mocked at the top level

Fix approach:
- Use beforeEach with vi.resetAllMocks() to clear all mock states
- Set up mocks fresh in each test or use helper functions that completely reset state
- Be careful about the order of mockResolvedValueOnce calls