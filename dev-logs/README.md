# Development Logs

This directory contains detailed documentation of challenges encountered during the development of ingestio, along with their root causes and solutions.

## Log Format

Each challenge is documented in a separate markdown file following this naming convention:
- `###-brief-description.md`

Each log should include:
- **Problem Description**: Clear explanation of the issue
- **Root Cause Analysis**: Investigation steps and findings  
- **Solution Implemented**: Code changes and approach
- **Verification**: How the fix was tested
- **Impact**: What was improved/fixed
- **Lessons Learned**: Key takeaways for future development

## Index

| File | Date | Issue | Status |
|------|------|-------|--------|
| [001-dng-exif-timestamp-mismatch.md](./001-dng-exif-timestamp-mismatch.md) | 2025-07-06 | DNG files getting incorrect timestamps due to EXIF parsing failure | ✅ Resolved |

## Guidelines

When documenting new challenges:

1. **Create immediately**: Document while the investigation is fresh
2. **Be specific**: Include exact error messages, file paths, and commands used
3. **Show evidence**: Include code snippets, test results, and before/after comparisons
4. **Think future**: Write for developers who might encounter similar issues
5. **Update index**: Add new entries to the table above

This helps maintain institutional knowledge and accelerates troubleshooting of similar issues in the future.