# App Service quota adjustment needed before deployment

Historical East US 2 diagnosis. The user has since selected Sweden Central, where the P0v3 ARM preview passed. This quota request is not a prerequisite for the current Sweden Central deployment.

Checked 18 October 2026 using the subscription's live quota APIs and an ARM what-if preview.

| Field | Value |
|---|---|
| Subscription | Visual Studio Enterprise Subscription |
| Subscription ID | 9d47bf93-091d-480e-a512-1e918864fee7 |
| Region | East US 2 / eastus2 |
| Plan | Linux Premium v3 P0v3, non-zone-redundant, one instance |
| P0v3 SKU quota | Limit 30, usage 0 |
| Total Regional VMs quota | Limit 0, usage 0 |
| Preview error | SubscriptionIsOverQuotaForSku |
| Tracking ID | 972ac052-0300-4325-85e6-b7490b3ac7f5 |

Both the SKU allowance and the regional aggregate allowance must be sufficient. The individual SKU allowance alone did not establish deployment readiness.

In Azure Portal, open Quotas → App Service (Public Preview), filter to this subscription and East US 2, and request a small **P0v3 VMs** increase, for example a new total of **31**. The current SKU allowance is already 30; do not request a lower total of 1. Microsoft documents that a SKU-level adjustment updates the regional aggregate allowance; the total regional allowance cannot be requested directly. [Official troubleshooting guidance](https://learn.microsoft.com/en-us/troubleshoot/azure/app-service/troubleshoot-non-zone-redundant-quota-requests#cause-2-the-sku-or-total-regional-vm-limit-is-0).

If the self-service request is rejected or the aggregate allowance remains zero, use its support-request option and provide:

> Please enable App Service non-zone-redundant regional quota for subscription 9d47bf93-091d-480e-a512-1e918864fee7 in East US 2. We need one Linux Premium v3 P0v3 instance. The P0v3 quota shows limit 30, usage 0, but Total Regional VMs shows limit 0, usage 0. ARM what-if fails with SubscriptionIsOverQuotaForSku, current limit 0, usage 0, required 1. Tracking ID: 972ac052-0300-4325-85e6-b7490b3ac7f5. Please reconcile the regional allowance so this deployment can proceed.

No resource deployment was executed. Keep the selected SKU and region unchanged. After the quota adjustment is approved, rerun both the quota checks and ARM what-if before running a provisioning command.
