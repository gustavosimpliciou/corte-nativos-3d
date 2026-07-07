import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetProject, useListOperations, useUpdateProject, useCreateOperation, getGetProjectQueryKey, getListOperationsQueryKey } from '@workspace/api-client-react';
import { Workspace3DCanvas } from '@/components/3d/Workspace3DCanvas';
import { useUIStore } from '@/stores/use-ui-store';
import { useSelectionStore } from '@/stores/use-selection-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { 
  ChevronLeft, MousePointer2, Maximize, Minimize, Scissors, 
  RotateCcw, Undo2, Redo2, Loader2, Download, Save, Triangle, Box, Crosshair, Wrench
} from 'lucide-react';
import { format } from 'date-fns';
import { OperationInputType } from '@workspace/api-client-react';

export default function Workspace() {
  const [match, params] = useRoute('/projects/:id');
  const projectId = match && params?.id ? parseInt(params.id, 10) : 0;

  const { data: project, isLoading: projectLoading } = useGetProject(projectId, { 
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) } 
  });
  
  const { data: operations, isLoading: opsLoading } = useListOperations({ projectId }, {
    query: { enabled: !!projectId, queryKey: getListOperationsQueryKey({ projectId }) }
  });

  const updateProject = useUpdateProject();
  const createOp = useCreateOperation();

  const { selectedTool, setSelectedTool, rightPanelMode, setRightPanelMode, sensitivity, setSensitivity, closeMesh, setCloseMesh, repairMesh, setRepairMesh } = useUIStore();
  const { selectedFaces, clearSelection } = useSelectionStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');

  // Handle setting name on load
  React.useEffect(() => {
    if (project && !isEditingName) {
      setProjectName(project.name);
    }
  }, [project, isEditingName]);

  const handleRename = () => {
    if (projectName !== project?.name) {
      updateProject.mutate({ id: projectId, data: { name: projectName } }, {
        onSuccess: () => {
          toast({ title: 'Renamed successfully' });
          setIsEditingName(false);
        }
      });
    } else {
      setIsEditingName(false);
    }
  };

  const handleCut = () => {
    if (!project?.models[0]) {
      toast({ title: 'No model loaded', variant: 'destructive' });
      return;
    }
    
    createOp.mutate({
      data: {
        projectId,
        modelId: project.models[0].id,
        type: 'cut' as OperationInputType,
        faceCount: selectedFaces.length || undefined,
        notes: `Manual cut using ${selectedTool} tool`
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Cut operation started', description: 'Processing on the server...' });
        clearSelection();
      }
    });
  };

  if (!match) return null;

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          
          <div className="flex items-center gap-2">
            {projectLoading ? (
              <div className="h-6 w-32 bg-accent animate-pulse rounded" />
            ) : isEditingName ? (
              <div className="flex items-center gap-2">
                <Input 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)}
                  className="h-8 text-sm w-48 bg-background border-primary/50 focus-visible:ring-primary"
                  autoFocus
                  onBlur={handleRename}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                />
              </div>
            ) : (
              <h1 
                className="text-sm font-medium cursor-pointer hover:text-primary transition-colors flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/50"
                onClick={() => setIsEditingName(true)}
              >
                {project?.name || 'Untitled Project'}
              </h1>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-background font-normal text-xs text-muted-foreground border-border">
            {project?.models?.length || 0} Models
          </Badge>
          <div className="h-4 w-px bg-border mx-2" />
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-2">
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-2">
            <Redo2 className="w-3.5 h-3.5" /> Redo
          </Button>
          <div className="h-4 w-px bg-border mx-2" />
          <Button size="sm" className="h-8 text-xs font-medium gap-2">
            <Save className="w-3.5 h-3.5" /> Export
          </Button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <aside className="w-16 border-r border-border bg-card flex flex-col items-center py-4 gap-2 z-10">
          <Tooltip title="Select (S)" side="right">
            <ToolButton icon={MousePointer2} active={selectedTool === 'select'} onClick={() => setSelectedTool('select')} />
          </Tooltip>
          <Tooltip title="Expand Selection (+)" side="right">
            <ToolButton icon={Maximize} active={selectedTool === 'expand'} onClick={() => setSelectedTool('expand')} />
          </Tooltip>
          <Tooltip title="Contract Selection (-)" side="right">
            <ToolButton icon={Minimize} active={selectedTool === 'contract'} onClick={() => setSelectedTool('contract')} />
          </Tooltip>
          <Tooltip title="Subtract Selection (Alt+Click)" side="right">
            <ToolButton icon={Scissors} active={selectedTool === 'subtract'} onClick={() => setSelectedTool('subtract')} />
          </Tooltip>
          <Tooltip title="Invert Selection (I)" side="right">
            <ToolButton icon={RotateCcw} active={selectedTool === 'invert'} onClick={() => setSelectedTool('invert')} />
          </Tooltip>
          
          <div className="w-8 h-px bg-border my-2" />
          
          <Tooltip title="Repair Mesh" side="right">
            <Button variant="ghost" size="icon" className="w-10 h-10 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10">
              <Wrench className="w-5 h-5" />
            </Button>
          </Tooltip>
        </aside>

        {/* Center Viewport */}
        <main className="flex-1 relative bg-background">
          {project?.models?.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80 backdrop-blur-sm">
              <Box className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-medium mb-2">No Model Loaded</h2>
              <p className="text-muted-foreground mb-6 max-w-sm text-center">Import an STL, OBJ, PLY, or 3MF file to begin preparation and cutting.</p>
              <Link href={`/projects/${projectId}/models`}>
                <Button className="bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                  <Triangle className="w-4 h-4 mr-2" />
                  Import Model
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {/* 3D Canvas */}
              <Workspace3DCanvas />
              
              {/* Overlays */}
              <div className="absolute top-4 right-4 flex gap-2">
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-card/80 backdrop-blur border border-border shadow-sm">
                  <Crosshair className="w-4 h-4" />
                </Button>
              </div>

              {/* Status indicator bottom left */}
              <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur border border-border px-3 py-1.5 rounded text-xs font-mono text-muted-foreground flex items-center gap-3">
                <span className="flex items-center"><Triangle className="w-3 h-3 mr-1" /> {project?.models[0]?.faceCount?.toLocaleString() || 0} faces</span>
                <span className="flex items-center"><Box className="w-3 h-3 mr-1" /> {project?.models[0]?.format.toUpperCase() || 'N/A'}</span>
              </div>
            </>
          )}
        </main>

        {/* Right Panel */}
        <aside className="w-80 border-l border-border bg-card flex flex-col z-10 overflow-y-auto">
          {/* Properties */}
          <div className="p-4 border-b border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Properties</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-foreground">Selection Mode</span>
                  <span className="text-primary font-medium">{rightPanelMode === 'smart' ? 'Smart' : 'Region'}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-background rounded-md border border-border">
                  <button 
                    className={`text-xs py-1 rounded ${rightPanelMode === 'smart' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setRightPanelMode('smart')}
                  >
                    Smart
                  </button>
                  <button 
                    className={`text-xs py-1 rounded ${rightPanelMode === 'region' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setRightPanelMode('region')}
                  >
                    Region
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-foreground">Sensitivity</span>
                  <span className="text-muted-foreground font-mono">{sensitivity}%</span>
                </div>
                <Slider 
                  value={[sensitivity]} 
                  onValueChange={(v) => setSensitivity(v[0])} 
                  max={100} 
                  step={1}
                  className="py-2"
                />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="close-mesh" className="text-sm cursor-pointer">Close mesh on cut</label>
                  <Switch id="close-mesh" checked={closeMesh} onCheckedChange={setCloseMesh} />
                </div>
                <div className="flex items-center justify-between">
                  <label htmlFor="repair-mesh" className="text-sm cursor-pointer">Auto-repair manifold</label>
                  <Switch id="repair-mesh" checked={repairMesh} onCheckedChange={setRepairMesh} />
                </div>
              </div>

              <Button 
                onClick={handleCut} 
                className="w-full mt-4 bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                disabled={project?.models?.length === 0 || createOp.isPending}
              >
                {createOp.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scissors className="w-4 h-4 mr-2" />}
                Execute Cut
              </Button>
            </div>
          </div>

          {/* History / Operations */}
          <div className="p-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Operation History</h3>
            
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {opsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-background rounded animate-pulse" />)}
                </div>
              ) : operations?.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No operations yet.
                </div>
              ) : (
                operations?.map(op => (
                  <div key={op.id} className="p-3 bg-background rounded-md border border-border text-sm flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-medium flex items-center capitalize">
                        {op.type}
                      </span>
                      <StatusBadge status={op.status} />
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground font-mono">
                      <span>{format(new Date(op.createdAt), 'HH:mm:ss')}</span>
                      <span>{op.durationMs ? `${(op.durationMs/1000).toFixed(1)}s` : '-'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Exports */}
          <div className="p-4 border-t border-border bg-background/50">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="w-full text-xs h-8 border-border hover:bg-accent hover:text-primary">
                STL Binary
              </Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-8 border-border hover:bg-accent hover:text-primary">
                OBJ
              </Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-8 border-border hover:bg-accent hover:text-primary">
                3MF
              </Button>
              <Button variant="outline" size="sm" className="w-full text-xs h-8 border-border hover:bg-accent hover:text-primary">
                PLY
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Subcomponents

function ToolButton({ icon: Icon, active, onClick }: { icon: any, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-10 h-10 flex items-center justify-center rounded-md transition-all duration-200 ${
        active 
          ? 'bg-primary text-primary-foreground shadow-sm' 
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Completed" />;
  if (status === 'failed') return <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" title="Failed" />;
  if (status === 'processing') return <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,106,0,0.6)]" title="Processing" />;
  return <span className="w-2 h-2 rounded-full bg-muted-foreground" title="Pending" />;
}

// Minimal tooltip wrapper for this file
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

function Tooltip({ children, title, side = 'top' }: { children: React.ReactNode, title: string, side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={5} className="z-50 overflow-hidden rounded-md bg-foreground px-3 py-1.5 text-xs text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          {title}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
