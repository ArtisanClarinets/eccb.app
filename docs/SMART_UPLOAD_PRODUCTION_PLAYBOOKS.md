# Smart Upload Production Playbooks
## Phase 1-2 Operational Runbooks

**Last Updated:** March 13, 2026  
**Phase Status:** Phase 1 COMPLETE (5/5 blockers fixed), Phase 2 COMPLETE (5/5 enhancements), Phase 3 COMPLETE (tests + playbooks + readiness)

---

## Quick Reference

| Scenario | Playbook | Severity | Duration | Prerequisite |
|---|---|---|---|---|
| Low-confidence upload review needed | [Review Low Confidence](#review-low-confidence) | P3 | 5-10 min | Web access to admin UI |
| Provider API failure during upload | [Handle Provider Failure](#handle-provider-failure) | P1 | 10-30 min | API credentials |
| Gap detected in PDF parsing | [Resolve Parsing Gaps](#resolve-parsing-gaps) | P2 | 15-45 min | PDF re-analysis |
| Operator needs to retry second-pass | [Retry Second-Pass](#retry-second-pass) | P2 | 5-10 min | BullMQ access |
| Deployment pre-flight check | [Pre-Deployment Checklist](#pre-deployment-checklist) | P0 | 10 min | Access to staging |
| Post-deployment validation | [Post-Deployment Validation](#post-deployment-validation) | P1 | 15-20 min | Access to production |
| Performance degradation observed | [Diagnose Latency](#diagnose-latency) | P2 | 20-40 min | Metrics/logs access |
| Database settings mismatch | [Fix Settings Sync](#fix-settings-sync) | P2 | 10-20 min | Database access |

---

## Playbook: Review Low Confidence

**Trigger:** Operator sees session with confidence < 70% in review queue  
**Goal:** Manually review, correct metadata, and approve/reject

### Steps

1. **Navigate to Review Page**
   - Go to `/admin/uploads/review`
   - Filter by `Requires Review` status
   - Click session with red confidence badge (< 70%)

2. **Examine Confidence Warning**
   - Read the warning banner displaying:
     - Current confidence score
     - OCR engine used (if applicable)
     - LLM fallback reasons (if available)
     - Raw OCR text availability status

3. **Review Extracted Metadata**
   - Check title, composer, instrument for accuracy
   - Compare against original PDF visually in preview pane
   - Manual corrections field available for notes

4. **Inspect Cutting Instructions**
   - Verify page ranges make sense
   - Look for "gaps" (parts 9900+) indicating uncovered pages
   - Edit parts or page ranges if needed

5. **Decision**
   - **Approve:** If corrections are acceptable
   - **Reject:** If metadata is too corrupted or PDF too scanned
   - **Delegate:** Mark for manual adjudication if uncertain

### Expected Behavior (Post Phase 1)

- **Before Phase 1:** Low confidence sessions might carry garbage data silently
- **After Phase 1:** Low confidence sessions consistently route to review; no auto-approval below threshold

### Common Issues

| Issue | Cause | Fix |
|---|---|---|
| Headers contain body text | Header extraction window too large (P1.4) | Handled; window is now 10% of page + 200 char cap |
| Provider returned error | Vision capability not checked (P1.2) | Handled; config-loader validates before calling |
| Gaps in splitting not detected | No hard stop (P1.3) | Handled; gaps now trigger review routing |

---

## Playbook: Handle Provider Failure

**Trigger:** Logs show `LLM_PROVIDER_ERROR` or HTTP error from vision service  
**Goal:** Switch providers and retry, or escalate with diagnostic context

### Steps

1. **Identify Failing Provider**
   ```bash
   # Check logs for session
   grep "sessionId=<SESSION_ID>" /var/log/eccb/smart-upload.log | tail -50
   ```
   - Look for line: `error: "Verify LLM call failed"`
   - Note provider name and model name

2. **Check Provider Status**
   - Verify API key is valid and has quota remaining
   - Check provider's status page for outages
   - Confirm endpoint URL is correct (for custom providers)

3. **Try Fallback Provider**
   ```bash
   # In admin UI: Settings → Smart Upload → LLM Provider
   # Option A: Switch to alternative provider
   #   e.g., OpenRuter → Anthropic, Anthropic → Gemini
   # Option B: Change model within provider if vision not supported
   ```

4. **Retry Session**
   - Click "▶ Retry Second-Pass" button in review UI
   - Monitor job queue: `/admin/jobs`
   - Expected duration: 30s–2 min depending on PDF size

5. **If Retry Fails Again**
   - Note exact error from logs
   - Check error code pattern (SU-5xx = LLM errors)
   - Escalate to ops with:
     - Session ID
     - Confidence score
     - PDF file size
     - Provider/model attempted
     - Error code and message

### Phase 1 Enhancement (P1.5)

After P1.5 fix:
- Error logs now include **provider, model, and error context**
- Recommendation field suggests fallback action
- Example log:
  ```json
  {
    "error": "Verify LLM call failed",
    "provider": "gemini",
    "model": "gemini-1.5-pro",
    "errorMessage": "403 Forbidden",
    "recommendation": "Operator should retry with alternative provider or manually review"
  }
  ```

---

## Playbook: Resolve Parsing Gaps

**Trigger:** Session has gap instructions (partNumber >= 9900) or status shows `Gap Detected`  
**Goal:** Explain gaps and remediate (re-run OCR, manual page assignment, or accept gap)

### Background (P1.3 Fix)

**Before Phase 1:** Gaps were silently ignored; second-pass ran on incomplete annotations  
**After Phase 1:** Gaps trigger hard stop; sessions route to review instead of second-pass

### Steps

1. **Identify Gaps**
   - Review page shows: "Uncovered page gaps detected"
   - Example: `pages 12–15 (gap), pages 18–22 (gap)`
   - These pages were not assigned to any part

2. **Analyze Root Cause**
   - Poor OCR on those pages?
   - Missing conductor score or part dividers?
   - Unusual page structure?

3. **Remediation Option A: Accept Gap**
   - If pages are appendices/blank: approve session as-is
   - Gap recorded in `smartUploadSession.cuttingInstructions` with special marker

4. **Remediation Option B: Manual Assignment**
   - Edit the "Cutting Instructions" table manually
   - Add a new row for gap pages with reasonable instrument guess
   - Save and approve

5. **Remediation Option C: Re-run OCR (Advanced)**
   - Request ops run OCR separately on gap pages
   - Re-queue second-pass verification
   - Update session with new annotations

### Phase 1.3 Enhancement

After P1.3 fix:
- **Before:** Second-pass ran on incomplete instructions, producing garbage
- **After:** Sessions with gaps route directly to human review
- **Benefit:** Operator gets explicit control; no invisible degradation

---

## Playbook: Retry Second-Pass

**Trigger:** Operator wants to re-run verification (e.g., after changing settings or confidence threshold)  
**Goal:** Queue session back to second-pass queue and monitor

### Steps

1. **Find Session**
   - Navigate to `/admin/uploads/review` or session detail page

2. **Click "▶ Retry" Button**
   - Button visible if `secondPassStatus` is FAILED or COMPLETE
   - Clicking immediately queues job to BullMQ

3. **Monitor Progress**
   - SSE connection in background updates live
   - Progress bar in dialog box shows:
     - "Downloading PDF" → "Rendering images" → "Calling LLM" → "Complete"
   - Typical duration: 30 sec – 2 min (depending on page count)

4. **After Retry**
   - Dialog closes when complete
   - Session detail refreshes with new confidence/metadata
   - If confidence improved: operator can press "Approve"
   - If confidence regressed: escalate to ops

### Common Reasons to Retry

1. Settings changed (e.g., switched to better model)
2. Confidence threshold lowered (session now eligible for auto-approval)
3. First attempt hit transient provider error (P1.5 fix ensures good error context)

---

## Playbook: Pre-Deployment Checklist

**Trigger:** Release manager preparing to deploy Phase 1-2 to production  
**Goal:** Validate staging environment passes all checks

### Checklist

- [ ] **Phase 1 Critical Fixes**
  - [ ] Confidence gating enforced (P1.1)
    - Test: Upload PDF with 64% confidence, verify it does NOT auto-approve
  - [ ] Provider vision capability validated (P1.2)
    - Test: Switch to text-only model, verify error handling or fallback
  - [ ] Gap detection triggers review (P1.3)
    - Test: Upload PDF with large gap, verify `routingDecision === 'no_parse_second_pass'`
  - [ ] Header extraction limited to 10% + 200 chars (P1.4)
    - Test: Extract text from scanned PDF, verify header length < 300 chars
  - [ ] Provider error context logged (P1.5)
    - Test: Force provider error, check logs for provider/model/recommendation

- [ ] **Phase 2 Enhancements**
  - [ ] Settings UI complete (P2.1)
    - Test: Access `/admin/settings`, verify 100+ settings visible
  - [ ] Error code system functional (P2.2)
    - Test: Check error logs, verify error codes (SU-xxx) appear
  - [ ] Preview endpoint error handling (P2.3)
    - Test: Request preview with invalid session ID, verify error code in response
  - [ ] Confidence warnings displayed (P2.4)
    - Test: Review session with 60% confidence, verify warning banner shown
  - [ ] Metrics recording working (P2.5)
    - Test: Upload session, check logs for `SMART_UPLOAD_METRIC` entries

- [ ] **Database**
  - [ ] SystemSetting table populated with defaults
    - `SELECT COUNT(*) FROM SystemSetting WHERE key LIKE 'smart_upload_%';` should return 100+
  - [ ] SmartUploadSession schema updated
    - All new Phase 1-2 columns present (`routingDecision`, error codes, etc.)

- [ ] **Logs & Monitoring**
  - [ ] Metrics are flowing to observability platform
    - Prometheus/DataDog dashboard shows smart-upload metrics
  - [ ] Error codes appear in logs
    - Search logs for pattern `SU_[0-9]{3}` returns results
  - [ ] Confidence scores logged with each session
    - Query logs: `confidenceScore` appears in >90% of session records

- [ ] **Performance**
  - [ ] Second-pass latency < 2 min for typical 20-page PDF
  - [ ] No provider timeouts (>30s) observed
  - [ ] Error recovery works: failed sessions can retry immediately

### Gate Criteria for Production Deploy

| Item | Pass Criteria | Impact if Failed |
|---|---|---|
| Confidence gating | 0 low-confidence auto-approvals in staging | P1 blocker |
| Error context | 100% of provider errors have sessionId + model logged | P1 blocker |
| Metrics | > 95% of sessions emit metrics events | P2 (nice-to-have) |
| Confidence warnings | Displayed for all confidence < 70% | P2 (nice-to-have) |

---

## Playbook: Post-Deployment Validation

**Trigger:** Phase 1-2 deployed to production  
**Goal:** Verify system behaves as expected; establish baseline metrics

### Hour 1 (Immediate)

- [ ] **Health Check**
  ```bash
  curl https://eccb.app/api/health/smart-upload
  ```
  - Verify response: `{ "status": "ok", "workers": 2 }`

- [ ] **Sample Upload**
  - Upload 1 test PDF (El Capitan.pdf recommended)
  - Verify it completes without errors
  - Check confidence score is reasonable

- [ ] **Check Logs**
  ```bash
  grep "SmartUploadMetric\|ERROR" /var/log/eccb/smart-upload.log | tail -20
  ```
  - No spike in errors
  - Metrics events flowing normally

### Hour 2-4 (Observe)

- [ ] **Monitor Queue Depth**
  - Admin UI: `/admin/jobs` → SMART_UPLOAD queue
  - Expected: < 5 jobs queued (depends on upload rate)

- [ ] **Sample Review Session**
  - Visit `/admin/uploads/review`
  - Click random session, verify:
    - Confidence badge colored correctly (red < 70%, yellow 70–85%, green ≥ 85%)
    - If confidence < 70%: Warning banner present
    - Error codes visible if applicable

- [ ] **Metrics Dashboard**
  - Open observability platform (Prometheus/DataDog)
  - Check metrics:
    - `smart_upload_sessions_total` (counter)
    - `smart_upload_latency_seconds` (histogram)
    - `smart_upload_errors_total` by error code
  - Baseline established; no spike vs. staging

### Day 1 (End-of-Day)

- [ ] **SLOs Met**
  - Upload success rate > 95%
  - Median latency < 1 min for second-pass
  - P99 latency < 3 min

- [ ] **No Low-Confidence Auto-Approvals**
  - Query: `SELECT COUNT(*) FROM SmartUploadSession WHERE confidenceScore < 70 AND status = 'AUTO_COMMITTED' AND createdAt >= NOW() - '1 day'::INTERVAL;`
  - Expected: 0 (P1.1 fix prevents this)

- [ ] **Error Codes in Use**
  - Query logs for error codes
  - Document which codes are appearing most (e.g., SU-401 auth error)

### Rollback Trigger

If any of these occur, prepare to rollback:
- Upload success rate drops below 90%
- Unknown error spike (> 10x baseline)
- Low-confidence session auto-approvals observed (indicates P1.1 regression)
- Provider failures unrecoverable (indicates P1.5 logging broken)

---

## Playbook: Diagnose Latency

**Trigger:** Operator reports "uploads are slow" or latency > 2 min for typical PDF  
**Goal:** Identify bottleneck (LLM, PDF rendering, storage, etc.)

### Steps

1. **Check Recent Metrics**
   ```bash
   # Query observability platform for latency histogram
   # Expected: p50 ~30s, p99 ~120s
   SELECT percentiles(smart_upload_latency_seconds, [50, 95, 99]) GROUP BY step
   ```

2. **Analyze by Step**
   - Identify which step is slow:
     - `vision` (LLM vision call)
     - `verification` (second-pass)
     - `segmentation` (PDF text extraction)
     - `rendering` (PDF → images)
     - `overall` (entire pipeline)

3. **PDF Rendering (Often Slowest)**
   - If `rendering` step > 30s:
     - Large PDF (check size)
     - Complex PDF (many fonts, images)
     - Remedy: Increase `smart_upload_llm_max_pages` setting to sample fewer pages

4. **LLM Vision Call**
   - If `vision` step > 60s:
     - Provider rate-limited
     - Network latency to provider
     - Remedy: Switch provider or increase `smart_upload_rate_limit_rpm` setting

5. **Segmentation (Text Extraction)**
   - If `segmentation` step > 30s:
     - Scanned PDF (high OCR time)
     - Header extraction taking time (P1.4 should have limited this)
     - Remedy: Enable `smart_upload_local_ocr_enabled` toggle to use local OCR

6. **Storage Operations**
   - If upload/download step > 10s:
     - Network issue to storage (S3/MinIO)
     - Storage service slow
     - Remedy: Check storage service health; increase timeouts

### Common Patterns

| Pattern | Root Cause | Remediation |
|---|---|---|
| All steps slow uniformly | Provider rate-limited or network degraded | Wait 5 min, check provider status |
| Rendering + vision slow | Large PDF, many pages | Reduce `llm_max_pages` setting |
| Segmentation slow | Scanned PDF with poor OCR | Enable OCR-first pipeline (P2) |
| Verification > 2 min | Second-pass re-processing too much | Check gap detection (P1.3) |

---

## Playbook: Fix Settings Sync

**Trigger:** Admin changes a setting in UI, but workers still use old value  
**Goal:** Diagnose cache/database mismatch and resync

### Steps

1. **Verify Setting Was Saved**
   ```sql
   SELECT key, value, updatedAt FROM SystemSetting
   WHERE key = 'smart_upload_confidence_threshold'
   ORDER BY updatedAt DESC LIMIT 1;
   ```
   - Confirm new value and timestamp are correct

2. **Check Worker Configuration**
   - Workers load settings from DB every 5 minutes (default cache TTL)
   - If change doesn't propagate in 5 min, possible issue:

3. **Clear Cache (if Redis deployed)**
   ```bash
   redis-cli DEL "eccb:smart-upload:config"
   ```
   - Workers will reload from DB on next job

4. **Restart Worker (if necessary)**
   ```bash
   # Graceful shutdown with job draining
   kill -TERM <worker-pid>
   # Worker will process current jobs, then exit
   # Restart: `npm run start:workers`
   ```

5. **Verify Propagation**
   - Upload new PDF
   - Check logs for new setting value:
     ```bash
     grep "confidence_threshold" /var/log/eccb/smart-upload.log | tail -1
     ```

### Prevention

- Always allow 5+ min after setting change before uploads
- Monitor: `/admin/settings` → "Last Updated" timestamps
- Settings in Phase 1-2 now logged to metrics; check observability platform

---

## Playbook: Respond to Production Incident

**Trigger:** Alert fires for smart upload error rate > 10%  
**Goal:** Rapid diagnosis and mitigation

### Immediate Actions (0–5 min)

1. **Page On-Call Engineer** ✓
2. **Check Status Dashboard**
   - Observability platform → smart-upload health
   - Identify error pattern:
     - All errors same code? → provider issue
     - Scattered errors? → data quality issue

3. **Query Recent Error Logs**
   ```bash
   grep "ERROR.*SU_" /var/log/eccb/smart-upload.log | head -20
   ```
   - Look for error code pattern (SU-4xx = LLM, SU-7xx = storage, etc.)
   - Identify if same session failing repeatedly

### Short-Term Mitigation (5–15 min)

| If Error Code | Action | Rationale |
|---|---|---|
| SU-4xx (LLM) | Switch provider in settings | Provider outage; P1.5 logs context |
| SU-7xx (Storage) | Check storage service health | S3/MinIO issue |
| SU-001 (Config) | Verify SystemSetting table populated | DB sync issue |
| SU-401 (Auth) | Rotate API keys or check permissions | Credentials expired |
| SU-100–199 (Intake) | Check uploaded PDF quality | Malformed PDF |

### Investigation (15+ min)

1. **Correlation Check**
   - Did error start after deployment? → Rollback
   - Did error start after setting change? → Revert setting
   - Did error start after provider outage? → Wait for provider recovery + retry

2. **Sample Failing Session**
   - Get session ID from logs
   - Run `/api/admin/uploads/review/:id/preview` to test
   - Check response error code and message (P2.3 enhancement)

3. **Post-Incident Review**
   - Document which error code caught the issue early
   - Verify metrics dashboard showed degradation (P2.5)
   - Update runbooks if new pattern discovered

---

## Alerting Rules (Phase 1-2)

Configure alerts on observability platform:

```yaml
alerts:
  - name: SmartUploadHighErrorRate
    condition: rate(smart_upload_errors_total[5m]) > 0.1
    severity: critical
    runbook: "Respond to Production Incident"

  - name: SmartUploadHighLatency
    condition: histogram_quantile(0.95, smart_upload_latency_seconds) > 120
    severity: warning
    runbook: "Diagnose Latency"

  - name: SmartUploadLowConfidenceAutoApproved
    condition: increase(smart_upload_status_auto_committed{confidence_lt_70}[1h]) > 0
    severity: critical
    runbook: "Manual Audit — Indicates P1.1 Regression"

  - name: SmartUploadQueueBacklog
    condition: bullmq_queue_depth{queue="SMART_UPLOAD"} > 50
    severity: warning
    runbook: "Check worker concurrency; may need to scale"
```

---

## Summary

| Phase | Fixes/Enhancements | Verification |
|---|---|---|
| **Phase 1** | 5 critical blockers | Pre-deploy checklist (8 items) |
| **Phase 2** | 5 operational enhancements | E2E tests (50+ test cases) |
| **Phase 3** | Playbooks + deployment guide | Post-deploy validation (3h timeline) |

**Ready for production deployment when:** All items in pre-deploy checklist pass AND post-deploy validation completes successfully.
