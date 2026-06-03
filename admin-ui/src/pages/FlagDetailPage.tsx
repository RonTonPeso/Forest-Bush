import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import {
  apiClient,
  type AuditEvent,
  type Environment,
  type EvaluationResult,
  type EvaluationTrace,
  type FeatureFlag,
} from '../lib/api';

interface FlagDetailPageProps {
  apiKey: string;
  flag: FeatureFlag;
  onBack: () => void;
  onUpdate: (updatedFlag: FeatureFlag) => void;
}

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

// Turns an evaluation trace into readable lines explaining the decision.
const describeTrace = (trace: EvaluationTrace): string[] => {
  if (!trace.flagFound) {
    return ['Flag not found in this environment, returning disabled.'];
  }

  const lines = [`Flag is ${trace.flagEnabled ? 'enabled' : 'disabled'}.`];

  if (!trace.flagEnabled) {
    return lines;
  }

  if (trace.rule === 'none' || trace.rolloutPercentage === null) {
    lines.push('No rollout rule, enabled for everyone.');
    return lines;
  }

  lines.push(`Rollout rule: ${trace.rolloutPercentage}%.`);

  if (trace.userId === null || trace.bucket === null) {
    lines.push('No userId provided, percentage rollouts need one to be sticky.');
    return lines;
  }

  const matched = trace.bucket < trace.rolloutPercentage;
  lines.push(`Bucket for "${trace.userId}" is ${trace.bucket}.`);
  lines.push(`${trace.bucket} ${matched ? '<' : '>='} ${trace.rolloutPercentage} -> ${matched ? 'match' : 'miss'}.`);
  return lines;
};

export default function FlagDetailPage({ apiKey, flag, onBack, onUpdate }: FlagDetailPageProps) {
  const [rolloutPercentage, setRolloutPercentage] = useState(flag.rules?.rolloutPercentage ?? 0);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [testUserId, setTestUserId] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const loadAuditEvents = useCallback(async (key: string, environment: Environment) => {
    setIsLoadingAudit(true);
    setAuditError(null);

    try {
      const events = await apiClient.getFlagAudit(apiKey, key, environment);
      setAuditEvents(events);
    } catch {
      setAuditError('Failed to load audit events.');
    } finally {
      setIsLoadingAudit(false);
    }
  }, [apiKey]);

  useEffect(() => {
    setRolloutPercentage(flag.rules?.rolloutPercentage ?? 0);
    setEvaluation(null);
    loadAuditEvents(flag.key, flag.environment);
  }, [flag.key, flag.environment, flag.rules?.rolloutPercentage, loadAuditEvents]);

  const handleSaveRollout = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const updatedFlag = await apiClient.updateFlag(
        apiKey,
        flag.key,
        { rules: { rolloutPercentage } },
        flag.environment
      );
      onUpdate(updatedFlag);
      await loadAuditEvents(flag.key, flag.environment);
      toast.success(`Flag "${flag.key}" rollout updated.`);
    } catch {
      toast.error('Failed to update rollout percentage.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEvaluation = async (event: FormEvent) => {
    event.preventDefault();
    setIsEvaluating(true);
    setEvaluation(null);

    try {
      const result = await apiClient.evaluateFlag(
        flag.key,
        flag.environment,
        testUserId.trim() || undefined,
        true
      );
      setEvaluation(result);
    } catch {
      toast.error('Failed to evaluate flag.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-blue-300 hover:text-blue-200 mb-6"
      >
        &lt;- Back to flags
      </button>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold text-white break-all">{flag.key}</h2>
            <p className="text-gray-400 mt-2">{flag.description || 'No description provided.'}</p>
          </div>
          <span className="bg-gray-700 text-gray-200 rounded-full px-3 py-1 text-sm">
            {flag.environment}
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 text-sm">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className={flag.enabled ? 'text-green-400' : 'text-gray-300'}>
              {flag.enabled ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="text-gray-300">{formatDate(flag.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Updated</dt>
            <dd className="text-gray-300">{formatDate(flag.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <section className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Rollout Rules</h3>
          <form onSubmit={handleSaveRollout}>
            <label htmlFor="detail-rollout" className="block text-gray-300 font-bold mb-3">
              Rollout Percentage
            </label>
            <div className="flex items-center gap-4">
              <input
                id="detail-rollout"
                type="range"
                min="0"
                max="100"
                value={rolloutPercentage}
                onChange={(event) => setRolloutPercentage(Number(event.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                disabled={isSaving}
              />
              <span className="text-white font-semibold w-12 text-center">{rolloutPercentage}%</span>
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Rules'}
            </button>
          </form>
        </section>

        <section className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Test Evaluation</h3>
          <form onSubmit={handleTestEvaluation}>
            <label htmlFor="test-user-id" className="block text-gray-300 font-bold mb-3">
              User ID
            </label>
            <input
              id="test-user-id"
              type="text"
              value={testUserId}
              onChange={(event) => setTestUserId(event.target.value)}
              placeholder="e.g., user-123"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isEvaluating}
            />
            <button
              type="submit"
              disabled={isEvaluating}
              className="mt-5 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-green-400 disabled:cursor-not-allowed"
            >
              {isEvaluating ? 'Evaluating...' : 'Evaluate'}
            </button>
          </form>
          {evaluation && (
            <div className="mt-5 bg-gray-900 rounded-md p-4">
              <p className="text-sm text-gray-400">Result</p>
              <p className={evaluation.enabled ? 'text-green-400 text-lg' : 'text-red-300 text-lg'}>
                {evaluation.enabled ? 'Enabled' : 'Disabled'}
              </p>
              <p className="text-sm text-gray-500">Reason: {evaluation.reason}</p>
              {evaluation.trace && (
                <ul className="mt-3 border-t border-gray-700 pt-3 space-y-1">
                  {describeTrace(evaluation.trace).map((line, index) => (
                    <li key={index} className="text-sm text-gray-400">{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Recent Audit Events</h3>
        {isLoadingAudit && <p className="text-gray-400">Loading audit events...</p>}
        {auditError && <p className="text-red-400">{auditError}</p>}
        {!isLoadingAudit && !auditError && auditEvents.length === 0 && (
          <p className="text-gray-400">No audit events recorded yet.</p>
        )}
        {!isLoadingAudit && !auditError && auditEvents.length > 0 && (
          <div className="space-y-3">
            {auditEvents.map((event) => (
              <div key={event.id} className="bg-gray-900 rounded-md p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-wide text-xs text-blue-300">{event.action}</span>
                  <span className="text-xs text-gray-500">{formatDate(event.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">Actor: {event.actor}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
