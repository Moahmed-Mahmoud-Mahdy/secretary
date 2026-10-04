'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderKanban, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SekretirProgress } from '@/components/sekretir/progress';
import {
  apiErrorMessage,
  endpoints,
  isAuthError,
  type Priority,
  type ProjectDTO,
  type TaskDTO,
} from '@/lib/sekretir/api';
import { PRIORITY_META, PRIORITY_OPTIONS } from '@/lib/sekretir/constants';
import { fmtDayMonth, fromLocalInputValue } from '@/lib/sekretir/date-utils';
import { cn } from '@/lib/utils';

interface ProjectsViewProps {
  refreshKey: number;
  onAuthError: () => void;
}

export function ProjectsView({ refreshKey, onAuthError }: ProjectsViewProps) {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', deadline: '', priority: 'MEDIUM' as Priority });
  const [creating, setCreating] = useState(false);

  // detail dialog
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ project: ProjectDTO; tasks: TaskDTO[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // delete
  const [deleteProject, setDeleteProject] = useState<ProjectDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { projects: p } = await endpoints.projects();
      setProjects(p);
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function openDetail(id: string) {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const data = await endpoints.project(id);
      setDetail(data);
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function createProject() {
    if (!form.name.trim() || creating) return;
    setCreating(true);
    try {
      await endpoints.createProject({
        name: form.name.trim(),
        description: form.description.trim() || null,
        deadline: fromLocalInputValue(form.deadline),
        priority: form.priority,
      });
      setCreateOpen(false);
      setForm({ name: '', description: '', deadline: '', priority: 'MEDIUM' });
      toast.success('اتعمل المشروع 📁');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function addTaskToProject() {
    if (!detail || !newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);
    try {
      await endpoints.createTask({ title: newTaskTitle.trim(), projectId: detail.project.id });
      setNewTaskTitle('');
      const data = await endpoints.project(detail.project.id);
      setDetail(data);
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAddingTask(false);
    }
  }

  async function toggleDetailTask(task: TaskDTO) {
    if (!detail) return;
    const completing = task.status !== 'COMPLETED';
    try {
      await endpoints.updateTask(task.id, { status: completing ? 'COMPLETED' : 'TODO' });
      const data = await endpoints.project(detail.project.id);
      setDetail(data);
      await load();
      if (completing) toast.success('برافو! ✅');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function confirmDelete() {
    if (!deleteProject || deleting) return;
    setDeleting(true);
    try {
      await endpoints.deleteProject(deleteProject.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteProject.id));
      if (detailId === deleteProject.id) setDetailId(null);
      toast.success('المشروع اتشال — المهام هتفضل موجودة 👌');
      setDeleteProject(null);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-stone-900">المشاريع</h1>
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-full"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          مشروع جديد
        </Button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="py-12 text-center">
            <p className="text-4xl mb-3" aria-hidden>🗂️</p>
            <p className="font-bold text-stone-700">مفيش مشاريع لسه</p>
            <p className="text-sm text-stone-400 mt-1">
              اعمل مشروع وجمع فيه مهامك — أو قول سكرتير «اعمل مشروع التخرج» 😄
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-200 transition-all cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => openDetail(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openDetail(p.id);
              }}
              aria-label={`افتح مشروع ${p.name}`}
            >
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0"
                      aria-hidden
                    >
                      <FolderKanban className="size-4 text-amber-600" />
                    </span>
                    <h3 className="font-bold text-stone-800 truncate">{p.name}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-stone-300 hover:text-rose-600 hover:bg-rose-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteProject(p);
                    }}
                    aria-label={`امسح مشروع ${p.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {p.description ? (
                  <p className="text-xs text-stone-500 line-clamp-2">{p.description}</p>
                ) : null}

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-stone-500 font-semibold">
                      {p.doneCount}/{p.tasksCount} مهام
                    </span>
                    <span className="font-extrabold text-amber-700 tabular-nums">{p.progress}%</span>
                  </div>
                  <SekretirProgress
                    value={p.progress}
                    barClassName={p.progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}
                    ariaLabel={`تقدم مشروع ${p.name}`}
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', PRIORITY_META[p.priority].badge)}>
                    {PRIORITY_META[p.priority].label}
                  </span>
                  {p.deadline ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 tabular-nums">
                      ⏰ {fmtDayMonth(p.deadline)}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto sekretir-scroll">
          <DialogHeader>
            <DialogTitle>مشروع جديد 📁</DialogTitle>
            <DialogDescription>سمّي المشروع وحط تفاصيله.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="proj-name">اسم المشروع</Label>
              <Input
                id="proj-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: مشروع التخرج"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">وصف</Label>
              <Input
                id="proj-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="اختياري"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="proj-deadline">آخر معاد</Label>
                <Input
                  id="proj-deadline"
                  type="datetime-local"
                  dir="ltr"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>الأولوية</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={createProject}
              disabled={creating || !form.name.trim()}
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              اعمل المشروع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project detail dialog */}
      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="rounded-2xl max-h-[85dvh] overflow-hidden flex flex-col">
          {detailLoading || !detail ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="size-6 animate-spin text-amber-600" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{detail.project.name}</DialogTitle>
                {detail.project.description ? (
                  <DialogDescription>{detail.project.description}</DialogDescription>
                ) : null}
              </DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', PRIORITY_META[detail.project.priority].badge)}>
                  {PRIORITY_META[detail.project.priority].label}
                </span>
                <span className="text-xs text-stone-500 font-semibold">
                  {detail.project.doneCount}/{detail.project.tasksCount} خلصت
                </span>
              </div>
              <div className="flex-1 overflow-y-auto sekretir-scroll max-h-80 -mx-1 px-1 space-y-1.5">
                {detail.tasks.length === 0 ? (
                  <p className="text-center text-sm text-stone-400 py-8">
                    لسه مفيش مهام في المشروع — ضيف أول مهمة 👇
                  </p>
                ) : (
                  detail.tasks.map((t) => {
                    const done = t.status === 'COMPLETED';
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-2.5 rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2"
                      >
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggleDetailTask(t)}
                          className="size-4 shrink-0 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                          aria-label={done ? 'ارجع المهمة' : 'خلصت المهمة'}
                        />
                        <span
                          className={cn(
                            'text-sm flex-1 break-words',
                            done ? 'line-through text-stone-400' : 'text-stone-700'
                          )}
                        >
                          {t.title}
                        </span>
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', PRIORITY_META[t.priority].badge)}>
                          {PRIORITY_META[t.priority].label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-stone-100 mt-3">
                <Input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTaskToProject();
                  }}
                  placeholder="ضيف مهمة في المشروع..."
                  className="text-sm"
                />
                <Button
                  size="icon"
                  className="size-9 rounded-full bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  onClick={addTaskToProject}
                  disabled={addingTask || !newTaskTitle.trim()}
                  aria-label="ضيف المهمة"
                >
                  {addingTask ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteProject !== null} onOpenChange={(o) => !o && setDeleteProject(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تشيل مشروع «{deleteProject?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              المهام هتفضل موجودة بس من غير مشروع — مش هتتمسح.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>سيبه</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              شيله
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
