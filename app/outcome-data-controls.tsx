"use client";

import { Download, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchOutcomeJson, type SubmitStatus, useOutcomeSession } from "./outcome-session";

type ConsentRecord = {
  id: string;
  consent_version: string;
  consented_at: string;
  revoked_at: string | null;
};

type ExportPayload = {
  consent_records: ConsentRecord[];
  applicant_profiles: unknown[];
  application_outcomes: unknown[];
  data_access_logs: unknown[];
};

type RevokeResponse = {
  consent_record?: ConsentRecord;
};

type DeleteCounts = {
  consent_records: number;
  applicant_profiles: number;
  application_outcomes: number;
  data_access_logs: number;
};

type DeleteResponse = {
  deleted?: DeleteCounts;
};

function downloadJsonFile(payload: ExportPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fitty-my-data.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCounts(counts: DeleteCounts) {
  return [
    `${counts.consent_records} consent records`,
    `${counts.applicant_profiles} profiles`,
    `${counts.application_outcomes} outcomes`,
    `${counts.data_access_logs} access logs`,
  ].join(", ");
}

export function OutcomeDataControlsPanel() {
  const {
    captureStatus,
    signedIn,
    accessToken,
    resetLocalOutcomeState,
    resetVersion,
  } = useOutcomeSession();
  const [exportData, setExportData] = useState<ExportPayload | null>(null);
  const [exportStatus, setExportStatus] = useState<SubmitStatus>("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [revokeStatusById, setRevokeStatusById] = useState<Record<string, SubmitStatus>>({});
  const [revokeMessage, setRevokeMessage] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<SubmitStatus>("idle");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deletedCounts, setDeletedCounts] = useState<DeleteCounts | null>(null);
  const confirmedDelete = deleteConfirmation === "DELETE";

  const activeConsents = useMemo(
    () => exportData?.consent_records.filter((record) => !record.revoked_at) ?? [],
    [exportData],
  );

  if (captureStatus !== "enabled" || !signedIn) {
    return null;
  }

  async function handleExport() {
    if (!accessToken) {
      setExportStatus("error");
      setExportMessage("Please sign in again before exporting.");
      return;
    }

    setExportStatus("saving");
    setExportMessage("");

    try {
      const payload = await fetchOutcomeJson<ExportPayload>(
        "/api/outcomes/export-my-data",
        accessToken,
      );
      setExportData(payload);
      downloadJsonFile(payload);
      setExportStatus("success");
      setExportMessage(
        "Your data file was prepared. Active consent records are listed below.",
      );
      setDeletedCounts(null);
    } catch (error) {
      setExportStatus("error");
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  async function handleRevoke(consentRecordId: string) {
    if (!accessToken) {
      setRevokeMessage("Please sign in again before revoking consent.");
      return;
    }

    setRevokeStatusById((current) => ({ ...current, [consentRecordId]: "saving" }));
    setRevokeMessage("");

    try {
      const payload = await fetchOutcomeJson<RevokeResponse>(
        "/api/outcomes/revoke-consent",
        accessToken,
        {
          method: "POST",
          body: { consent_record_id: consentRecordId },
        },
      );
      setExportData((current) => {
        if (!current) {
          return current;
        }

        const revokedRecord = payload.consent_record;
        return {
          ...current,
          consent_records: current.consent_records.map((record) =>
            record.id === consentRecordId
              ? revokedRecord ?? { ...record, revoked_at: new Date().toISOString() }
              : record,
          ),
        };
      });
      setRevokeStatusById((current) => ({
        ...current,
        [consentRecordId]: "success",
      }));
      setRevokeMessage("Consent revoked. Future storage under that consent is stopped.");
    } catch (error) {
      setRevokeStatusById((current) => ({ ...current, [consentRecordId]: "error" }));
      setRevokeMessage(error instanceof Error ? error.message : "Consent was not revoked.");
    }
  }

  async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setDeleteStatus("error");
      setDeleteMessage("Please sign in again before deleting data.");
      return;
    }
    if (!confirmedDelete) {
      setDeleteStatus("error");
      setDeleteMessage("Type DELETE before permanently deleting your data.");
      return;
    }

    setDeleteStatus("saving");
    setDeleteMessage("");

    try {
      const payload = await fetchOutcomeJson<DeleteResponse>(
        "/api/outcomes/delete-my-data",
        accessToken,
        { method: "DELETE" },
      );
      const deleted = payload.deleted;
      if (!deleted) {
        throw new Error("Delete completed, but no counts were returned.");
      }
      setDeletedCounts(deleted);
      setExportData(null);
      setExportStatus("idle");
      setRevokeStatusById({});
      setRevokeMessage("");
      setDeleteConfirmation("");
      setDeleteStatus("success");
      setDeleteMessage(`Deleted ${formatCounts(deleted)}.`);
      resetLocalOutcomeState();
    } catch (error) {
      setDeleteStatus("error");
      setDeleteMessage(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  return (
    <section
      className="capture-panel data-controls-panel"
      aria-label="Data controls"
      data-testid="outcome-data-controls"
      data-reset-version={resetVersion}
    >
      <div className="capture-head">
        <div>
          <div className="section-kicker">Data controls</div>
          <h2 className="capture-title">Manage the records you shared.</h2>
          <p className="helper mt-2">
            Export your data, revoke active consent for future storage, or delete the
            outcome records connected to your signed-in account.
          </p>
        </div>
        <ShieldAlert size={24} aria-hidden="true" />
      </div>

      <div className="capture-body">
        <div className="control-card">
          <div>
            <div className="section-kicker">Export</div>
            <h3 className="section-title">Download a copy.</h3>
            <p className="helper mt-2">
              This prepares a JSON file. The raw data is not shown on this screen.
            </p>
          </div>
          <button
            className="capture-primary"
            type="button"
            disabled={exportStatus === "saving"}
            onClick={handleExport}
          >
            <Download size={16} />
            {exportStatus === "saving" ? "Preparing file" : "Export my data"}
          </button>
          {exportMessage ? (
            <p
              className={exportStatus === "error" ? "error-copy" : "success-copy"}
              role="status"
            >
              {exportMessage}
            </p>
          ) : null}
        </div>

        <div className="control-card">
          <div>
            <div className="section-kicker">Revoke consent</div>
            <h3 className="section-title">Stop future storage.</h3>
            <p className="helper mt-2">
              Revoking consent stops future storage under that consent. It does not
              delete data already stored. Use the delete action below for that.
            </p>
          </div>

          {!exportData ? (
            <p className="helper">
              Export your data first to load active consent records for this account.
            </p>
          ) : activeConsents.length === 0 ? (
            <p className="helper">No active consent records were found.</p>
          ) : (
            <ul className="consent-record-list">
              {activeConsents.map((record) => (
                <li key={record.id}>
                  <div>
                    <strong>{record.consent_version}</strong>
                    <p className="helper">
                      Recorded {formatDate(record.consented_at)}
                    </p>
                  </div>
                  <button
                    className="capture-secondary"
                    type="button"
                    disabled={revokeStatusById[record.id] === "saving"}
                    onClick={() => void handleRevoke(record.id)}
                  >
                    <RotateCcw size={16} />
                    {revokeStatusById[record.id] === "saving" ? "Revoking" : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {revokeMessage ? (
            <p
              className={
                Object.values(revokeStatusById).includes("error")
                  ? "error-copy"
                  : "success-copy"
              }
              role="status"
            >
              {revokeMessage}
            </p>
          ) : null}
        </div>

        <form className="control-card delete-card" onSubmit={handleDelete}>
          <div>
            <div className="section-kicker">Delete</div>
            <h3 className="section-title">Permanently delete my data.</h3>
            <p className="helper mt-2">
              This permanently deletes your consent records, profiles, outcomes, and
              existing access logs for this account. It cannot be undone. A single
              deletion tombstone is retained for compliance.
            </p>
          </div>
          <label className="control">
            <span className="field-label">Type DELETE to confirm</span>
            <input
              className="text-control mono"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="DELETE"
            />
          </label>
          <button
            className="capture-primary danger-button"
            type="submit"
            disabled={!confirmedDelete || deleteStatus === "saving"}
          >
            <Trash2 size={16} />
            {deleteStatus === "saving" ? "Deleting data" : "Delete my data"}
          </button>
          {deleteMessage ? (
            <p
              className={deleteStatus === "error" ? "error-copy" : "success-copy"}
              role="status"
            >
              {deleteMessage}
            </p>
          ) : null}
          {deletedCounts ? (
            <div className="delete-counts" data-testid="delete-counts">
              <span>{deletedCounts.consent_records} consent records</span>
              <span>{deletedCounts.applicant_profiles} profiles</span>
              <span>{deletedCounts.application_outcomes} outcomes</span>
              <span>{deletedCounts.data_access_logs} access logs</span>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
