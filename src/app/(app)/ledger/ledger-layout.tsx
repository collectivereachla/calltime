"use client";

import { useState } from "react";
import { LedgerView } from "./ledger-view";
import { BudgetView } from "./budget-view";

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
}

interface ContractSummary {
  person_name: string;
  role_title: string;
  compensation: string | null;
  contract_type: string;
}

type Tab = "contracts" | "budget";

interface Props {
  contracts: Contract[];
  templates: Template[];
  budgetItems: BudgetItem[];
  contractSummaries: ContractSummary[];
  canManage: boolean;
  canSeeContent: boolean;
  personId: string;
  personName: string;
}

export function LedgerLayout(props: Props) {
  const [tab, setTab] = useState<Tab>("contracts");

  // Budget tab only visible to owner/production
  const showBudget = props.canManage;

  const tabs: { key: Tab; label: string }[] = [
    { key: "contracts", label: "Contracts" },
    ...(showBudget ? [{ key: "budget" as Tab, label: "Budget" }] : []),
  ];

  return (
    <div>
      {/* Tab bar — only show if budget is available */}
      {showBudget && (
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
        />
      )}

      {tab === "budget" && showBudget && (
        <BudgetView
          budgetItems={props.budgetItems}
          contractSummaries={props.contractSummaries}
          canSeeContent={props.canSeeContent}
        />
      )}
    </div>
  );
}
