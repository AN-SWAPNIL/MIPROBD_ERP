import { sql, type SQLWrapper } from "drizzle-orm";
import { employees } from "../../database/schema.js";
import { deletedInvitationCode } from "./invitation-policy.js";

// Removed onboarding keeps its audit references, but is no longer a directory account.
export function visibleEmployee(id: SQLWrapper = employees.id) {
  return sql`not exists (select 1 from erp_private.invitation_jobs removed_invitation where removed_invitation.employee_id=${id} and removed_invitation.last_code=${deletedInvitationCode})`;
}
