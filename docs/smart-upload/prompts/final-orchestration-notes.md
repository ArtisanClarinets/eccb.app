# Final Orchestration Notes

When all phases complete and tests pass, perform the following wrap‑up actions. Do NOT proceed to these wrap-up actions unless you have verified the Definition of Done is fully implemented, all code passes linting and typechecking without warnings/errors.

1. **Commit Changes:** Ensure all migration files are staged and tested. Run `npm run db:generate` to update Prisma client.
2. **Documentation:** Update `SMART_UPLOAD_SYSTEM_AUDIT.md` and README with new architecture diagrams and state tables. Add changelog entries describing each phase.
3. **Review:** Perform a final code review of all modified files, paying attention to cross‑referenced enums and provider constants.
4. **Smoke Test:** Deploy to a staging environment and run the full validation QA prompts against real storage (MinIO) and an accessible LLM provider.
5. **Merge PR:** Once staging tests succeed, merge the branch. Tag release per project conventions.
6. **Monitor:** After deployment, monitor logs for anomalies; set up alerts for `requiresHumanReview` rates or commit failures.
7. **Handoff:** Share prompt library and orchestrator instructions with team; note any manual operational steps (e.g., migrating legacy sessions).

Keep this notes file updated if the orchestration process is reused or audited later.
