'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isPendingStudyStub, StudyWorkspaceItem } from '@/types';
import {
  deleteStudy,
  getAllStudies,
  reconcileStudyOperations,
  getAllProjects,
  createNewProject,
  removeProject,
  moveStudyToProject,
  type StoredProject,
} from '@/services/storageService';
import { Button, Coordinate, Label, Measure, Rule } from '@/components/ui';

export default function StudyList() {
  const router = useRouter();
  const [studies, setStudies] = useState<StudyWorkspaceItem[]>([]);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [kvWarning, setKvWarning] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleMessage, setSampleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hostedMode, setHostedMode] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  // Project state
  const [filterProjectId, setFilterProjectId] = useState<string | 'all'>('all');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [moveStudyId, setMoveStudyId] = useState<string | null>(null);
  const [movingStudy, setMovingStudy] = useState(false);

  const actionsTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const projectById = useMemo(
    () => new Map(projects.map(p => [p.id, p])),
    [projects],
  );

  const filteredStudies = useMemo(() => {
    if (filterProjectId === 'all') return studies;
    if (filterProjectId === 'none') {
      return studies.filter(s => isPendingStudyStub(s) || !s.projectId);
    }
    return studies.filter(s => !isPendingStudyStub(s) && s.projectId === filterProjectId);
  }, [studies, filterProjectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studyResult, projectResult] = await Promise.all([
        getAllStudies(),
        getAllProjects(),
      ]);
      setStudies(studyResult.studies);
      setProjects(projectResult.projects);
      setKvWarning(
        studyResult.warning ||
        (studyResult.outcome.status !== 'ok' ? studyResult.outcome.error : null),
      );
      if (studyResult.pendingStudies && studyResult.pendingStudies.length > 0) {
        setOperationNotice(
          `${studyResult.pendingStudies.length} study operation(s) are awaiting reconciliation.`,
        );
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runReconciliation = async () => {
    setIsReconciling(true);
    const result = await reconcileStudyOperations();
    if (!result.success) {
      setOperationNotice(result.error || 'Study reconciliation is temporarily unavailable.');
    } else if (result.stillPending > 0) {
      setOperationNotice(
        `${result.stillPending} study operation(s) are still inside the safety window. Retry shortly.`
      );
    } else if (result.completed > 0 || result.rolledBack > 0) {
      setOperationNotice('Pending study changes were reconciled successfully.');
    } else {
      setOperationNotice(null);
    }
    setIsReconciling(false);
    await loadData();
  };

  useEffect(() => {
    const initializeWorkspace = async () => {
      let hosted = false;
      try {
        const response = await fetch('/api/config/mode');
        const data = await response.json();
        hosted = data.mode === 'hosted';
      } catch {
        hosted = false;
      }
      setHostedMode(hosted);
      if (hosted) {
        await runReconciliation();
      } else {
        await loadData();
      }
    };
    void initializeWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this study? This cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    try {
      const result = await deleteStudy(id);
      if (result.success) {
        setStudies(studies.filter(s => s.id !== id));
      } else if (result.pending) {
        setOperationNotice(result.error || 'Study deletion is awaiting reconciliation.');
      } else {
        alert(result.error || 'Failed to delete study');
      }
    } catch (error) {
      console.error('Error deleting study:', error);
      alert('Failed to delete study');
    } finally {
      setDeletingId(null);
      setMenuOpenId(null);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setSampleMessage(null);
    try {
      const response = await fetch('/api/demo/seed', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setSampleMessage({
          type: 'success',
          text: `Sample workspace loaded: ${data.data.studiesSeeded} study, ${data.data.interviewsSeeded} interviews`
        });
        await loadData();
      } else {
        setSampleMessage({ type: 'error', text: data.error || 'Failed to load sample workspace' });
      }
    } catch (error) {
      console.error('Error loading sample workspace:', error);
      setSampleMessage({ type: 'error', text: 'Failed to load sample workspace' });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleClearSample = async () => {
    if (!confirm('Clear the synthetic sample study and interviews from this workspace?')) return;
    setLoadingSample(true);
    setSampleMessage(null);
    try {
      const response = await fetch('/api/demo/seed', { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        setSampleMessage({ type: 'success', text: 'Sample workspace cleared' });
        await loadData();
      } else {
        setSampleMessage({ type: 'error', text: data.error || 'Failed to clear sample workspace' });
      }
    } catch (error) {
      console.error('Error clearing sample workspace:', error);
      setSampleMessage({ type: 'error', text: 'Failed to clear sample workspace' });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const result = await createNewProject(name);
      if (result.project) {
        setProjects(prev => [result.project!, ...prev]);
        setNewProjectName('');
        setShowCreateProject(false);
      } else {
        alert(result.error || 'Failed to create project');
      }
    } catch {
      alert('Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? Studies in this project will become uncategorized.`)) return;
    const result = await removeProject(projectId);
    if (result.success) {
      setProjects(prev => prev.filter(p => p.id !== projectId));
      // Refresh studies to clear their projectId
      await loadData();
      if (filterProjectId === projectId) setFilterProjectId('all');
    } else {
      alert(result.error || 'Failed to delete project');
    }
  };

  const handleMoveStudy = async (targetProjectId: string | null) => {
    if (!moveStudyId) return;
    setMovingStudy(true);
    try {
      const result = await moveStudyToProject(moveStudyId, targetProjectId);
      if (result.success) {
        // Update local study projectId so UI reflects immediately
        setStudies(prev => prev.map(s => {
          if (s.id !== moveStudyId || isPendingStudyStub(s)) return s;
          return { ...s, projectId: targetProjectId ?? undefined };
        }));
        // Update project studyCounts
        setProjects(prev => prev.map(p => {
          const study = studies.find(s => s.id === moveStudyId && !isPendingStudyStub(s));
          const oldProjectId = study && !isPendingStudyStub(study) ? study.projectId : undefined;
          if (p.id === oldProjectId) return { ...p, studyCount: Math.max(0, p.studyCount - 1) };
          if (p.id === targetProjectId) return { ...p, studyCount: p.studyCount + 1 };
          return p;
        }));
        setMoveStudyId(null);
      } else {
        alert(result.error || 'Failed to move study');
      }
    } catch {
      alert('Failed to move study');
    } finally {
      setMovingStudy(false);
    }
  };

  const hasSampleData = studies.some(s => s.id.startsWith('demo-'));

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

  const handleTbodyKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-row-primary]')
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return;
    const nextIndex = event.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= buttons.length) return;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  const moveStudySubject = moveStudyId
    ? studies.find(s => s.id === moveStudyId)
    : null;
  const moveStudyName = moveStudySubject && !isPendingStudyStub(moveStudySubject)
    ? moveStudySubject.config.name
    : '';
  const moveStudyCurrentProjectId = moveStudySubject && !isPendingStudyStub(moveStudySubject)
    ? moveStudySubject.projectId ?? null
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-sans text-[24px] leading-[32px] font-semibold text-ink-900">My Research</h1>
          <p className="text-[13px] text-ink-500">
            {studies.length} {studies.length === 1 ? 'study' : 'studies'}
            {projects.length > 0 && ` across ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="quiet" onClick={() => setShowCreateProject(v => !v)}>
            {showCreateProject ? 'Cancel' : 'New Project'}
          </Button>
          <Button type="button" variant="primary" onClick={() => router.push('/setup')}>
            Create Study
          </Button>
          {hasSampleData ? (
            <Button type="button" variant="quiet" onClick={() => void handleClearSample()} disabled={loadingSample}>
              Clear Sample
            </Button>
          ) : (
            <Button
              type="button"
              variant="quiet"
              onClick={() => void handleLoadSample()}
              disabled={loadingSample || !!kvWarning}
            >
              Load Sample
            </Button>
          )}
        </div>
      </div>

      {/* Create Project inline form */}
      {showCreateProject && (
        <div className="mt-4 flex items-center gap-2 border border-ink-300 bg-paper-1 px-4 py-3 rounded">
          <input
            type="text"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreateProject(); if (e.key === 'Escape') { setShowCreateProject(false); setNewProjectName(''); } }}
            placeholder="Project name…"
            autoFocus
            maxLength={200}
            className="flex-1 bg-transparent text-[14px] text-ink-900 placeholder-ink-400 outline-none"
          />
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleCreateProject()}
            disabled={creatingProject || !newProjectName.trim()}
          >
            {creatingProject ? 'Creating…' : 'Create'}
          </Button>
        </div>
      )}

      <Rule className="my-6" />

      {/* Filter bar — show only when there are projects */}
      {projects.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Filter:</span>
          <button
            type="button"
            onClick={() => setFilterProjectId('all')}
            className={`rounded px-2 py-1 text-[12px] ${filterProjectId === 'all' ? 'bg-ink-900 text-paper-1' : 'bg-paper-2 text-ink-700 hover:bg-paper-pop'}`}
          >
            All
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilterProjectId(p.id)}
              className={`rounded px-2 py-1 text-[12px] ${filterProjectId === p.id ? 'bg-ink-900 text-paper-1' : 'bg-paper-2 text-ink-700 hover:bg-paper-pop'}`}
            >
              {p.name} ({p.studyCount})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilterProjectId('none')}
            className={`rounded px-2 py-1 text-[12px] ${filterProjectId === 'none' ? 'bg-ink-900 text-paper-1' : 'bg-paper-2 text-ink-700 hover:bg-paper-pop'}`}
          >
            Uncategorized
          </button>
        </div>
      )}

      {/* Warnings */}
      {kvWarning && (
        <div className="mb-6 border-l-2 border-error bg-paper-2 px-4 py-3">
          <Label>
            {kvWarning.toLowerCase().includes('unavailable') ? 'Workspace unavailable' : 'Storage Not Configured'}
          </Label>
          <p className="mt-1 text-[13px] text-ink-700">{kvWarning}</p>
          {!kvWarning.toLowerCase().includes('unavailable') && (
            <p className="mt-1 text-[13px] text-ink-700">
              See the README for setup instructions using Upstash Redis.
            </p>
          )}
        </div>
      )}

      {operationNotice && (
        <div role="status" className="mb-6 border-l-2 border-error bg-paper-2 px-4 py-3">
          <Label>Pending reconciliation</Label>
          <p className="mt-1 text-[13px] text-ink-700">{operationNotice}</p>
          {hostedMode && (
            <Button
              type="button"
              variant="quiet"
              onClick={() => void runReconciliation()}
              disabled={isReconciling}
              className="mt-2"
            >
              Reconcile
            </Button>
          )}
        </div>
      )}

      {sampleMessage && (
        <div
          className={`mb-6 flex items-start gap-3 border-l-2 bg-paper-2 px-4 py-3 ${
            sampleMessage.type === 'success' ? 'border-success' : 'border-error'
          }`}
        >
          <p className="flex-1 text-[13px] text-ink-700">{sampleMessage.text}</p>
          <button
            type="button"
            onClick={() => setSampleMessage(null)}
            aria-label="Dismiss message"
            className="text-ink-500 hover:text-ink-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Projects list (compact) — only when there are projects */}
      {!loading && projects.length > 0 && filterProjectId === 'all' && (
        <div className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Projects</h2>
          <div className="flex flex-wrap gap-2">
            {projects.map(p => (
              <div key={p.id} className="flex items-center gap-1 rounded border border-ink-300 bg-paper-1 px-3 py-2">
                <span className="text-[13px] font-medium text-ink-900">{p.name}</span>
                <span className="text-[12px] text-ink-500 ml-1">({p.studyCount})</span>
                <button
                  type="button"
                  onClick={() => void handleDeleteProject(p.id, p.name)}
                  aria-label={`Delete project ${p.name}`}
                  className="ml-2 text-[11px] text-ink-400 hover:text-error"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <p className="text-[13px] text-ink-500">Loading…</p>
      ) : studies.length === 0 ? (
        <Measure>
          <h2 className="font-sans text-[18px] font-semibold text-ink-900">
            {kvWarning ? 'Workspace unavailable' : 'No Studies Yet'}
          </h2>
          <p className="mt-2 text-[15px] text-ink-700">
            {kvWarning ? kvWarning : 'Create your first study or load a synthetic sample workspace.'}
          </p>
          <div className="mt-4 flex items-center gap-4">
            {!kvWarning && (
              <Button type="button" variant="primary" onClick={() => router.push('/setup')}>
                Create Study
              </Button>
            )}
            {!kvWarning && (
              <Button type="button" variant="quiet" onClick={() => void handleLoadSample()} disabled={loadingSample}>
                Load Sample
              </Button>
            )}
          </div>
          {!kvWarning && (
            <p className="mt-4 text-[13px] text-ink-500">
              The sample writes one fictional study, 3 completed interviews, and scripted analysis to your configured storage.
            </p>
          )}
        </Measure>
      ) : filteredStudies.length === 0 ? (
        <p className="text-[13px] text-ink-500">No studies match this filter.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-300">
                <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  Study
                </th>
                {projects.length > 0 && (
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:table-cell"
                  >
                    Project
                  </th>
                )}
                <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  Interviews
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:table-cell"
                >
                  Created
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 md:table-cell"
                >
                  Questions
                </th>
                <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody onKeyDown={handleTbodyKeyDown}>
              {filteredStudies.map((study) => {
                const pending = isPendingStudyStub(study);
                const name = pending ? 'Study change pending' : study.config.name;
                const studyProjectId = !pending ? study.projectId : undefined;
                const studyProject = studyProjectId ? projectById.get(studyProjectId) : undefined;
                return (
                  <tr
                    key={study.id}
                    className="border-b border-ink-200 hover:bg-paper-1"
                    onClick={() => router.push(`/studies/${study.id}`)}
                  >
                    <td className="px-3 py-3 align-top text-[13px] text-ink-700">
                      <button
                        type="button"
                        data-row-primary
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/studies/${study.id}`);
                        }}
                        className="text-left font-sans text-[14px] font-medium text-ink-900 underline-offset-2 hover:text-action hover:underline"
                      >
                        {name}
                      </button>
                      {pending ? (
                        <p className="text-[13px] text-ink-500">Reconciliation pending ({study.phase})</p>
                      ) : study.config.description ? (
                        <p className="line-clamp-1 text-[13px] text-ink-500">{study.config.description}</p>
                      ) : null}
                    </td>
                    {projects.length > 0 && (
                      <td className="hidden px-3 py-3 align-top text-[13px] text-ink-500 md:table-cell">
                        {studyProject ? (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setFilterProjectId(studyProject.id); }}
                            className="text-[13px] text-action hover:underline"
                          >
                            {studyProject.name}
                          </button>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 align-top text-[13px] text-ink-700">
                      <Coordinate>{pending ? 0 : study.interviewCount}</Coordinate>
                    </td>
                    <td className="hidden px-3 py-3 align-top text-[13px] text-ink-700 md:table-cell">
                      <Coordinate>{pending ? '—' : formatDate(study.createdAt)}</Coordinate>
                    </td>
                    <td className="hidden px-3 py-3 align-top text-[13px] text-ink-700 md:table-cell">
                      <Coordinate>{pending ? '—' : study.config.coreQuestions.length}</Coordinate>
                    </td>
                    <td className="px-3 py-3 align-top text-[13px] text-ink-700">
                      {pending ? (
                        <span className="text-error">Reconciliation pending</span>
                      ) : (
                        <span className={study.isLocked ? 'text-ink-500' : 'text-success'}>
                          {study.isLocked ? 'Locked' : 'Editable'}
                        </span>
                      )}
                    </td>
                    <td
                      className="relative px-3 py-3 align-top text-[13px]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        ref={(el) => {
                          actionsTriggerRefs.current[study.id] = el;
                        }}
                        onClick={() => setMenuOpenId(menuOpenId === study.id ? null : study.id)}
                        aria-label={`Open actions for ${name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpenId === study.id}
                        className="text-[13px] text-ink-500 hover:text-ink-900"
                      >
                        Actions
                      </button>
                      {menuOpenId === study.id && (
                        <div
                          className="absolute right-0 z-10 mt-1 w-52 rounded border border-ink-300 bg-paper-1 shadow-note"
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setMenuOpenId(null);
                              actionsTriggerRefs.current[study.id]?.focus();
                            }
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              router.push(`/studies/${study.id}`);
                              setMenuOpenId(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2"
                          >
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (pending) return;
                              sessionStorage.setItem('prefillStudyConfig', JSON.stringify(study.config));
                              router.push(`/setup?prefill=edit&studyId=${study.id}`);
                              setMenuOpenId(null);
                            }}
                            disabled={pending}
                            className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Edit &amp; Generate Link
                          </button>
                          {projects.length > 0 && !pending && (
                            <button
                              type="button"
                              onClick={() => {
                                setMoveStudyId(study.id);
                                setMenuOpenId(null);
                              }}
                              className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2"
                            >
                              Move to Project…
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(study.id)}
                            disabled={pending || deletingId === study.id || (!pending && study.interviewCount > 0)}
                            className="block w-full px-3 py-2 text-left text-[13px] text-error hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Move to Project modal */}
      {moveStudyId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50"
          onClick={() => setMoveStudyId(null)}
        >
          <div
            className="w-full max-w-sm rounded border border-ink-300 bg-paper-1 p-6 shadow-note"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-1 font-sans text-[16px] font-semibold text-ink-900">Move to Project</h3>
            <p className="mb-4 text-[13px] text-ink-500 line-clamp-1">{moveStudyName}</p>
            <div className="flex flex-col gap-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleMoveStudy(p.id)}
                  disabled={movingStudy || p.id === moveStudyCurrentProjectId}
                  className="flex items-center justify-between rounded px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-paper-2 disabled:cursor-default disabled:opacity-50"
                >
                  <span>{p.name}</span>
                  {p.id === moveStudyCurrentProjectId && (
                    <span className="text-[11px] text-ink-400">current</span>
                  )}
                </button>
              ))}
              {moveStudyCurrentProjectId && (
                <button
                  type="button"
                  onClick={() => void handleMoveStudy(null)}
                  disabled={movingStudy}
                  className="rounded px-3 py-2 text-left text-[13px] text-ink-500 hover:bg-paper-2 disabled:opacity-50"
                >
                  Remove from project
                </button>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="quiet" onClick={() => setMoveStudyId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
