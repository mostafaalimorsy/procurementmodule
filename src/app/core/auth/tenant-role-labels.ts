export const PREDEFINED_TENANT_ROLES = [
  { value: 'CompanyAdmin', label: $localize`:@@role.companyAdmin:Company Admin` },
  { value: 'ProcurementManager', label: $localize`:@@role.procurementManager:Procurement Manager` },
  {
    value: 'ProcurementOfficer',
    label: $localize`:@@role.procurementOfficer:Procurement Engineer / Officer`,
  },
  { value: 'CommercialQs', label: $localize`:@@role.commercialQs:Commercial / QS` },
  { value: 'TechnicalEvaluator', label: $localize`:@@role.technicalEvaluator:Technical Evaluator` },
  { value: 'ProjectManager', label: $localize`:@@role.projectManager:Project Manager` },
  { value: 'ApproverDirector', label: $localize`:@@role.approverDirector:Approver / Director` },
] as const;

export type PredefinedTenantRole = (typeof PREDEFINED_TENANT_ROLES)[number]['value'];

/**
 * Built on each call (as the labels catalogue is), so a label read after the translations load is translated even when this module
 * was evaluated first (an Arabic spec, a list of role names).
 */
const roleLabels = (): Record<string, string> => ({
  CompanyAdmin: $localize`:@@role.companyAdmin:Company Admin`,
  ProcurementManager: $localize`:@@role.procurementManager:Procurement Manager`,
  ProcurementOfficer: $localize`:@@role.procurementOfficer:Procurement Engineer / Officer`,
  CommercialQs: $localize`:@@role.commercialQs:Commercial / QS`,
  TechnicalEvaluator: $localize`:@@role.technicalEvaluator:Technical Evaluator`,
  ProjectManager: $localize`:@@role.projectManager:Project Manager`,
  ApproverDirector: $localize`:@@role.approverDirector:Approver / Director`,
});

export function tenantRoleLabel(role: string): string {
  return roleLabels()[role] ?? role;
}
