#!/bin/bash

# ====================================
# Security Audit Script
# Runs npm audit and reports vulnerabilities
# ====================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
AUDIT_LEVEL="${AUDIT_LEVEL:-moderate}"  # low, moderate, high, critical
OUTPUT_FORMAT="${OUTPUT_FORMAT:-text}"   # text, json
EXIT_ON_VULN="${EXIT_ON_VULN:-true}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ECCB Security Audit                  ${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

# Change to project root
cd "$(dirname "$0")/.."

echo -e "\n${YELLOW}Running npm audit...${NC}"
echo -e "Audit level: ${AUDIT_LEVEL}"
echo -e "Output format: ${OUTPUT_FORMAT}"
echo ""

# Run npm audit
if [ "$OUTPUT_FORMAT" == "json" ]; then
    AUDIT_OUTPUT=$(npm audit --audit-level="$AUDIT_LEVEL" --json 2>&1 || true)
else
    AUDIT_OUTPUT=$(npm audit --audit-level="$AUDIT_LEVEL" 2>&1 || true)
fi

# Check for vulnerabilities
if echo "$AUDIT_OUTPUT" | grep -q "found 0 vulnerabilities"; then
    echo -e "${GREEN}✓ No vulnerabilities found!${NC}"
    echo ""
    echo -e "${GREEN}All dependencies are secure.${NC}"
    exit 0
else
    echo "$AUDIT_OUTPUT"
    echo ""
    
    # Count vulnerabilities by severity
    CRITICAL=$(echo "$AUDIT_OUTPUT" | grep -c "critical" || echo "0")
    HIGH=$(echo "$AUDIT_OUTPUT" | grep -c "high" || echo "0")
    MODERATE=$(echo "$AUDIT_OUTPUT" | grep -c "moderate" || echo "0")
    LOW=$(echo "$AUDIT_OUTPUT" | grep -c "low" || echo "0")
    
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}  Vulnerability Summary                ${NC}"
    echo -e "${YELLOW}========================================${NC}"
    [ "$CRITICAL" -gt 0 ] && echo -e "${RED}  Critical: $CRITICAL${NC}"
    [ "$HIGH" -gt 0 ] && echo -e "${RED}  High: $HIGH${NC}"
    [ "$MODERATE" -gt 0 ] && echo -e "${YELLOW}  Moderate: $MODERATE${NC}"
    [ "$LOW" -gt 0 ] && echo -e "${BLUE}  Low: $LOW${NC}"
    echo ""
    
    # Provide remediation suggestions
    echo -e "${YELLOW}Remediation:${NC}"
    echo "  1. Run 'npm audit fix' to attempt automatic fixes"
    echo "  2. Run 'npm audit fix --force' for breaking changes (use with caution)"
    echo "  3. Review and update dependencies manually"
    echo "  4. Check for alternative packages if vulnerabilities persist"
    echo ""
    
    # Suggest running npm audit fix
    echo -e "${YELLOW}To attempt automatic fixes, run:${NC}"
    echo "  npm run security:fix"
    echo ""
    
    if [ "$EXIT_ON_VULN" == "true" ]; then
        echo -e "${RED}Security audit failed. Please address vulnerabilities before deploying.${NC}"
        exit 1
    fi
fi
