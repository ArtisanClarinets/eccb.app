# Smart Upload Enterprise Upgrade: Deployment Guide

> **NOTE:** Deployment steps for smart upload have moved to the
> [Smart Upload System Guide](./smart-upload/SMART_UPLOAD_SYSTEM_GUIDE.md).
> This enterprise upgrade document remains for historical reference.

## Pre-Deployment Checklist

### Code Review
- [ ] Review all changes in `src/lib/services/pdf-splitter-adaptive.ts` (NEW)
- [ ] Review modifications in `src/lib/services/pdf-splitter.ts` (fallover logic)
- [ ] Review modifications in `src/workers/smart-upload-processor.ts` (virus scanning)
- [ ] Review modifications in `src/lib/smart-upload/fallback-policy.ts` (reason codes)
- [ ] Verify no breaking changes to existing APIs
- [ ] Check for any new environment variable requirements

### Environment Configuration
- [ ] Verify `ENABLE_VIRUS_SCAN=true` is set
- [ ] Verify `CLAMAV_HOST` and `CLAMAV_PORT` are correctly configured
- [ ] Test ClamAV connectivity: `nc -zv $CLAMAV_HOST $CLAMAV_PORT`
- [ ] Verify node version supports `pdfjs-dist` (Node 14+)

### Testing
- [ ] Run unit tests: `npm test -- pdf-splitter-adaptive.test.ts`
- [ ] Run integration tests: `npm test -- virus-scanning.integration.test.ts`
- [ ] Run policy tests: `npm test -- fallback-policy.test.ts`
- [ ] Build and verify no TypeScript errors: `npm run build`
- [ ] Lint code: `npm run lint`

### Backup & Rollback Plan
- [ ] Backup current database state
- [ ] Document rollback procedure (delete new files, revert imports)
- [ ] Create feature flag for adaptive extraction if not already present
- [ ] Prepare previous version docker image for emergency rollback

---

## Deployment Steps

### Stage 1: Staging Environment

1. **Deploy code changes**
   ```bash
   git checkout -b feature/smart-upload-enterprise-upgrade
   git add src/lib/services/pdf-splitter-adaptive.ts
   git add src/lib/services/pdf-source.ts
   git add src/lib/services/pdf-splitter.ts
   git add src/workers/smart-upload-processor.ts
   git add src/lib/smart-upload/fallback-policy.ts
   git add docs/smart-upload-enterprise-upgrade.md
   git commit -m "feat: enterprise-grade smart upload with multi-parser fallover and virus scanning"
   git push origin feature/smart-upload-enterprise-upgrade
   ```

2. **Deploy to staging**
   ```bash
   npm run build  # Verify no errors
   docker build -t eccb-app:staging .
   docker push eccb-app:staging
   kubectl set image deployment/eccb-app-staging eccb-app=eccb-app:staging
   kubectl rollout status deployment/eccb-app-staging
   ```

3. **Verify ClamAV connectivity on staging**
   ```bash
   kubectl exec -it pod/eccb-app-staging-xxx -- \
     node -e "console.log(process.env.CLAMAV_HOST, process.env.CLAMAV_PORT)"
   kubectl exec -it pod/eccb-app-staging-xxx -- \
     nc -zv $CLAMAV_HOST $CLAMAV_PORT
   ```

4. **Run staging tests**
   ```bash
   # Upload clean file through staging UI
   curl -X POST https://staging.eccb.app/api/files/smart-upload \
     -F "file=@test-clean.pdf" \
     -H "Authorization: Bearer $STAGING_TOKEN"
   
   # Verify in logs:
   # - Virus scan completed successfully
   # - PDF parsing proceeded normally
   # - Session auto-committed with reason codes
   
   # Check logs
   kubectl logs -f deployment/eccb-app-staging -c eccb-app | grep -i "virus\|smart upload"
   ```

5. **Test with malformed PDF (if available)**
   ```bash
   # Upload known-problematic PDF
   curl -X POST https://staging.eccb.app/api/files/smart-upload \
     -F "file=@malformed-africa.pdf" \
     -H "Authorization: Bearer $STAGING_TOKEN"
   
   # Verify in logs:
   # - Virus scan passed
   # - PDF parsing attempted
   # - Adaptive extraction triggered ("pdf-lib failed, attempting adaptive extraction")
   # - All parts successfully created
   # - Reason codes show clear decision path
   ```

6. **Test virus detection (EICAR)**
   ```bash
   # Create EICAR test file
   echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > eicar.txt
   
   # Try to upload (should be rejected by ClamAV)
   curl -X POST https://staging.eccb.app/api/files/smart-upload \
     -F "file=@eicar.txt" \
     -H "Authorization: Bearer $STAGING_TOKEN"
   
   # Verify in logs:
   # - Virus scan detected threat
   # - Session marked PARSE_FAILED
   # - User receives "virus_detected" status
   # - Security alert logged
   ```

7. **Performance baseline**
   - Run 10 concurrent uploads on staging
   - Measure latency: P50, P95, P99
   - Record baseline metrics
   - Note: Adaptive fallover adds 0-500ms overhead if triggered

8. **Staging approval**
   - [ ] All tests passed
   - [ ] Logs show correct reason codes
   - [ ] Virus detection working
   - [ ] Performance acceptable
   - [ ] QA sign-off

### Stage 2: Production Canary Deployment (10% Traffic)

1. **Deploy with feature flag**
   ```bash
   git tag -a v1.2.0-smart-upload-enterprise -m "Enterprise smart upload upgrade"
   git push origin v1.2.0-smart-upload-enterprise
   
   # Merge to main
   git checkout main
   git pull origin feature/smart-upload-enterprise-upgrade --rebase
   git push origin main
   ```

2. **Create canary deployment**
   ```yaml
   # kubernetes/smart-upload-canary.yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: eccb-app-canary
   spec:
     selector:
       app: eccb-app-canary
     ports:
     - port: 3000
   ---
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: eccb-app-canary
   spec:
     replicas: 2
     selector:
       matchLabels:
         app: eccb-app-canary
     template:
       metadata:
         labels:
           app: eccb-app-canary
           version: v1.2.0
       spec:
         containers:
         - name: eccb-app
           image: eccb-app:v1.2.0
           env:
           - name: ENABLE_VIRUS_SCAN
             value: "true"
           # ... other env vars
   ```

3. **Deploy canary (10% traffic)**
   ```bash
   kubectl apply -f kubernetes/smart-upload-canary.yaml
   
   # Configure ingress to route 10% of traffic to canary (using service weight)
   # Assuming you're using a load balancer or ingress controller that supports weighted routing
   # e.g., Istio VirtualService:
   ```

4. **Monitor canary metrics**
   ```bash
   # Watch key metrics for 24 hours
   - smart_upload.pdf_split_fallover_rate
   - smart_upload.virus_scan_rejections
   - smart_upload.parse_success_rate
   - smart_upload.avg_processing_time_ms
   
   # Set alerts for:
   - fallover_rate > 5% (indicates contaminated pipeline)
   - parse_failure_rate increasing
   - virus_rejections spiking
   ```

5. **Canary analysis**
   - Compare canary success rate vs. stable
   - Check error logs for new failure patterns
   - Verify reason codes are clear and correct
   - Confirm no performance regression

### Stage 3: Progressive Rollout

If canary succeeds after 24 hours:

1. **Increase to 50% traffic**
   ```bash
   # Update ingress weight: 50/50 split
   kubectl rollout status deployment/eccb-app-canary
   ```

2. **Monitor additional 24 hours**

3. **Increase to 100% traffic**
   ```bash
   kubectl scale deployment/eccb-app --replicas=0
   kubectl scale deployment/eccb-app-canary --replicas=app-replicas
   kubectl delete deployment/eccb-app
   kubectl rename deployment eccb-app-canary eccb-app
   ```

4. **Verify 100% traffic**
   ```bash
   kubectl get deployment -o wide
   # Should show single eccb-app deployment handling all traffic
   ```

### Stage 4: Post-Deployment Verification

1. **Verify logging**
   ```bash
   # Check production logs for next 48 hours
   kubectl logs -f deployment/eccb-app -c eccb-app --tail=1000 | grep -i "virus\|adaptive\|reason"
   
   # Expected patterns:
   # - "Virus scanned with ClamAV"
   # - "[TEXT_COVERAGE_LOW]", "[METADATA_LOW_CONFIDENCE]", etc.
   # - "Successfully extracted pages using pdf-lib" OR "...using adaptive"
   ```

2. **Monitor dashboards**
   - Success rate (should be >= previous)
   - Processing time (should be +0-50ms on average)
   - Fallover rate (should be < 5%)
   - Virus rejections (monitor for anomalies)

3. **User communication**
   - Notify users of improved reliability
   - Document reason codes for support team
   - Monitor support tickets for new issues

4. **Database metrics**
   ```sql
   -- Check smart upload session distribution
   SELECT parseStatus, COUNT(*) FROM SmartUploadSession
   WHERE createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
   GROUP BY parseStatus;
   
   -- Expected: PARSE_COMPLETE should be higher than before
   ```

---

## Rollback Procedure (If Needed)

### Quick Rollback (< 5 minutes)

```bash
# If canary shows issues before reaching 50% traffic:
kubectl delete deployment/eccb-app-canary
kubectl scale deployment/eccb-app --replicas=desired-count

# Verify traffic flowing to stable version
kubectl get endpoints eccb-app
```

### Full Rollback to Previous Version

```bash
# 1. Identify previous stable version
git tag -l | grep -E 'v1\.[0-9]+\.[0-9]+' | tail -5

# 2. Build previous version image
docker build -t eccb-app:v1.1.0 --target v1.1.0 .

# 3. Revert deployment
kubectl set image deployment/eccb-app eccb-app=eccb-app:v1.1.0
kubectl rollout status deployment/eccb-app

# 4. Verify
curl https://eccb.app/api/health
# Should return success
```

### Data Consideration

- No database schema changes, so no migration rollback needed
- Virus scan results stored as logs only, not persisted to schema
- Fallback to previous code is safe and reversible

---

## Monitoring & Alerts

### Key Metrics to Track

```
smart_upload.pdf_split_fallover_rate
  - Type: Gauge
  - Alert: > 5% for 1 hour
  - Action: Investigate if malformed PDFs entered pipeline

smart_upload.virus_scan_rejections
  - Type: Counter
  - Alert: 100+ rejections in 1 hour
  - Action: Possible ransomware/malware outbreak, investigate

smart_upload.parse_success_rate
  - Type: Gauge (%)
  - Alert: < 95% for 5 minutes
  - Action: Page query, check logs for new error patterns

smart_upload.avg_processing_time_ms
  - Type: Histogram
  - Alert: P95 > 1000ms for 15 minutes
  - Action: Check worker resource utilization, database performance
```

### Log Queries

**Find all adaptive extraction uses in last 24h:**
```
level=INFO AND "Successfully extracted pages using" AND -"pdf-lib"
```

**Find virus rejections:**
```
level=ERROR AND ("Virus detected" OR "virus_detected" OR "FOUND")
```

**Find routing decisions:**
```
level=INFO AND "Route:" AND "[UPPERCASE_REASON_CODE]"
```

---

## Troubleshooting

### Issue: High Fallover Rate (> 10%)

**Symptoms:**
- Logs show "pdf-lib failed for this part" on many uploads
- Fallover metrics spiking

**Diagnosis:**
```bash
# Check which PDFs are triggering fallover
kubectl logs -f deployment/eccb-app | grep "pdf-lib failed" | head -20

# Collect a sample PDF that's failing
# Contact user or download from S3 storage
```

**Solution:**
1. Analyze sample PDFs for common corruption patterns
2. Consider adjusting fallover strategy (e.g., try raw-slice earlier)
3. If legitimate PDFs are being corrupted upstream, investigate source
4. If issue is widespread, prepare rollback

### Issue: ClamAV Connection Failures

**Symptoms:**
- Logs: "ClamAV scan timed out" or "connection refused"
- User uploads rejected with "virus scanner unavailable"

**Diagnosis:**
```bash
# Check ClamAV connectivity
kubectl exec -it pod/eccb-app-xxx -- \
  timeout 5 nc -zv $CLAMAV_HOST $CLAMAV_PORT

# Check ClamAV pod status
kubectl get pod -l app=clamav
kubectl logs pod/clamav-xxx

# Check network policy
kubectl get networkpolicies
```

**Solution:**
1. Verify ClamAV pod is running: `kubectl scale deployment/clamav --replicas=1`
2. Check network connectivity between app and ClamAV
3. Increase ClamAV timeout in code if timeouts are legitimate (slow SAM updates)
4. Disable virus scanning temporarily (if needed): `ENABLE_VIRUS_SCAN=false`

### Issue: Reason Codes Not Appearing in Logs

**Symptoms:**
- Reason field is empty or missing from logs
- Users see "Default text-only processing path" instead of specific codes

**Diagnosis:**
```bash
# Check if determineRoute is being called
kubectl logs -f deployment/eccb-app | grep "determineRoute"

# Check fallback-policy.ts was deployed
kubectl exec -it pod/eccb-app-xxx -- \
  grep -n "TEXT_COVERAGE_LOW" src/lib/smart-upload/fallback-policy.ts
```

**Solution:**
1. Verify code was deployed: `kubectl describe deployment/eccb-app`
2. Check image tag: `kubectl get deployment/eccb-app -o yaml | grep image:`
3. If stale image, force rollout: `kubectl rollout restart deployment/eccb-app`

---

## Success Criteria

Deployment is considered successful if:

- ✅ All unit tests pass
- ✅ Canary metrics within 5% of baseline for 24 hours
- ✅ Zero regression in parse_success_rate
- ✅ Fallover rate < 5%
- ✅ No spike in error logs
- ✅ Virus scans functioning (if available)
- ✅ Reason codes visible in logs for all routing decisions
- ✅ Support team confirms no user-facing issues

---

## Maintenance & Future Work

### Short-term (1-2 weeks)

- [ ] Collect real-world data on fallover rates
- [ ] Create runbooks for common failure scenarios
- [ ] Train support team on new reason codes

### Medium-term (1-2 months)

- [ ] Implement Session Heartbeat & Recovery (Phase 2)
- [ ] Add OpenTelemetry tracing (Phase 3)
- [ ] Create malformed PDF test suite

### Long-term (3-6 months)

- [ ] Decompose monolithic processor (Phase 3)
- [ ] Implement LLM rate limiting (Phase 4)
- [ ] Optimize parallel part processing (Phase 4)

---

## Contact & Escalation

| Issue | Owner | Contact |
|-------|-------|---------|
| Code Issues | Backend Team | #backend-oncall |
| ClamAV Issues | Infrastructure | #infrastructure |
| Performance Issues | DevOps | #performance-oncall |
| User Support | Support Team | #support |

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-09  
**Deployment Date:** TBD  
