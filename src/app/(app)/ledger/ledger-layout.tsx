"use client";

import { useState } from "react";
import { LedgerView } from "./ledger-view";
import { BudgetView } from "./budget-view";
import { TemplatesView } from "./templates-view";
import { InvoicesView, type InvoiceRow } from "./invoices-view";

interface Contract {
  id: string;
  person_name: string;
  person_id: string;
  role_title: string;
  compensation: string | null;
  status: string;
  signed_at: string | null;
  countersigned_at: string | null;
  viewed_at: string | null;
  template_id: string;
  production_id: string;
  contract_body: string | null;
  signature_typed: string | null;
  signature_draw_url: string | null;
  countersigned_typed: string | null;
  countersigned_draw_url: string | null;
}

interface Template {
  id: string;
  contract_type: string;
  title: string;
  body_markdown: string;
}

interface BudgetItem {
  id: string;
  expense_name: string;
  category: string;
  budget_amount: number | null;
  paid_by: string | null;
  vendor: string | null;
  notes: string | null;
  transaction_date: string | null;
  is_paid: boolean;
  paid_date: string | null;
  off_top: boolean;
}

interface ContractSummary {
  id: string;
  person_name: string;
  role_title: string;
  compensation: string | null;
  contract_type: string;
}

interface RevenueItem {
  id: string;
  source_name: string;
  category: string;
  amount: number | null;
  donor_or_event: string | null;
  received_date: string | null;
  notes: string | null;
  platform: string | null;
  is_received: boolean;
}

type Tab = "contracts" | "invoices" | "budget" | "templates";

interface Props {
  contracts: Contract[];
  templates: Template[];
  allTemplates: Template[];
  budgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  contractSummaries: ContractSummary[];
  canManage: boolean;
  canSeeContent: boolean;
  personId: string;
  personName: string;
  productionId: string;
  coproduction: {
    leadName: string; partnerName: string; leadPct: number; partnerPct: number;
    basis: string; fiscalAgent: "lead" | "partner"; notes: string | null;
  } | null;
  orgName: string;
  productions: { id: string; title: string; first_rehearsal: string | null; opening_date: string | null; closing_date: string | null }[];
  systemTemplates: { id: string; contract_type: string; title: string; body_markdown: string; is_system: boolean }[];
  invoices: InvoiceRow[];
  invoiceMyContract: { id: string; role_title: string; compensation: string | null; billTo: string | null; baseAmount: number | null } | null;
  invoicePaymentMethods: { method: string; label: string | null; details: string | null }[];
  invoiceW9Threshold: number;
  invoiceW9OnFile: boolean;
  invoiceMyAddress: string;
  invoiceProductionId: string;
  invoiceProductionTitle: string;
  invoiceOrgId: string;
  invoiceDefaultPayerId: string | null;
  invoiceFinancePayers: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }[];
  invoiceFinanceMethods: { id: string; method: string; label: string | null; production_id: string | null; enabled: boolean }[];
}

export function LedgerLayout(props: Props) {
  const [tab, setTab] = useState<Tab>("contracts");

  const showBudget = props.canManage;
  const showTemplates = props.canSeeContent;

  // Count contracts per template
  const contractCounts: Record<string, number> = {};
  for (const c of props.contracts) {
    contractCounts[c.template_id] = (contractCounts[c.template_id] || 0) + 1;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "contracts", label: "Contracts" },
    { key: "invoices" as Tab, label: "Invoices" },
    ...(showBudget ? [{ key: "budget" as Tab, label: "Budget" }] : []),
    ...(showTemplates ? [{ key: "templates" as Tab, label: "Templates" }] : []),
  ];

  return (
    <div>
      {tabs.length > 1 && (
        <div className="flex items-center gap-1 mb-6 border-b border-bone">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? "border-ink text-ink"
                  : "border-transparent text-ash hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "contracts" && (
        <LedgerView
          contracts={props.contracts}
          templates={props.templates}
          canManage={props.canManage}
          canSeeContent={props.canSeeContent}
          personId={props.personId}
          personName={props.personName}
          orgName={props.orgName}
          productions={props.productions}
        />
      )}

      {tab === "invoices" && (
        <InvoicesView
          canManage={props.canManage}
          personId={props.personId}
          myContract={props.invoiceMyContract}
          paymentMethods={props.invoicePaymentMethods}
          w9Threshold={props.invoiceW9Threshold}
          w9OnFile={props.invoiceW9OnFile}
          myAddress={props.invoiceMyAddress}
          invoices={props.invoices}
          productionId={props.invoiceProductionId}
          productionTitle={props.invoiceProductionTitle}
          orgId={props.invoiceOrgId}
          defaultPayerId={props.invoiceDefaultPayerId}
          financePayers={props.invoiceFinancePayers}
          financeMethods={props.invoiceFinanceMethods}
        />
      )}

      {tab === "budget" && showBudget && (
        <BudgetView
          budgetItems={props.budgetItems}
          revenueItems={props.revenueItems}
          contractSummaries={props.contractSummaries}
          canSeeContent={props.canSeeContent}
          productionId={props.productionId}
          coproduction={props.coproduction}
        />
      )}

      {tab === "templates" && showTemplates && (
        <TemplatesView
          templates={props.allTemplates}
          productionId={props.productionId}
          contractCounts={contractCounts}
          systemTemplates={props.systemTemplates}
        />
      )}
    </div>
  );
}
