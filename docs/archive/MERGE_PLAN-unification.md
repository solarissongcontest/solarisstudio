> **Historical document.** This was the original unified-app merge plan. The merge is complete; current architecture is documented in the repository README and MERGE_STATUS.

# Solaris unified app merge

Working plan used for merging SSC Confirmations and SSC Televoting into Solaris Studio.

- Solaris Studio remains the canonical application/repository.
- Confirmations visual language becomes the shared design baseline.
- Existing Solaris auth, countries, editions, shows and roles remain canonical.
- Confirmations feature tables/RPCs are adapted to the Solaris schema rather than copied blindly.
- Confirmations is integrated before Televoting.
- Existing standalone deployments remain untouched until the merged modules are verified.
