import React, { useState, useRef } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetProject, useListModels, useCreateModel, useDeleteModel, getGetProjectQueryKey, getListModelsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { UploadCloud, FileBox, Triangle, Trash2, ArrowLeft, Loader2, Box, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ModelInputFormat } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Models() {
  const [match, params] = useRoute('/projects/:id/models');
  const projectId = match && params?.id ? parseInt(params.id, 10) : 0;
  const queryClient = useQueryClient();

  const { data: project } = useGetProject(projectId, { 
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) } 
  });
  
  const { data: models, isLoading: modelsLoading } = useListModels({ projectId }, {
    query: { enabled: !!projectId, queryKey: getListModelsQueryKey({ projectId }) }
  });

  const createModel = useCreateModel();
  const deleteModel = useDeleteModel();
  
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = (file: File) => {
    // In a real app, this would read the file, extract vertex count, upload to blob storage, etc.
    // Here we simulate it.
    const ext = file.name.split('.').pop()?.toLowerCase();
    let format: ModelInputFormat = 'stl';
    if (ext === 'obj') format = 'obj';
    if (ext === 'ply') format = 'ply';
    if (ext === '3mf') format = '3mf';

    // Mock extraction
    const mockFaces = Math.floor(Math.random() * 500000) + 10000;
    const mockVertices = Math.floor(mockFaces * 0.5);

    createModel.mutate({
      data: {
        projectId,
        filename: file.name,
        format,
        faceCount: mockFaces,
        vertexCount: mockVertices,
        fileSizeBytes: file.size,
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Model imported successfully', description: file.name });
        queryClient.invalidateQueries({ queryKey: ['models', projectId] });
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      },
      onError: () => {
        toast({ title: 'Import failed', variant: 'destructive' });
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(processFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(processFile);
    }
  };

  const handleDelete = (id: number) => {
    deleteModel.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Model deleted' });
        queryClient.invalidateQueries({ queryKey: ['models', projectId] });
      }
    });
  };

  if (!match) return null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <header className="px-8 py-6 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="hover:bg-accent text-muted-foreground hover:text-foreground rounded-md w-8 h-8">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Model Assets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{project?.name || 'Loading project...'}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 max-w-7xl mx-auto w-full flex flex-col gap-8">
        
        {/* Upload Zone */}
        <div 
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors flex flex-col items-center justify-center
            ${isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card/50 hover:border-primary/50 hover:bg-card'}
            ${createModel.isPending ? 'opacity-50 pointer-events-none' : ''}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".stl,.obj,.ply,.3mf" 
            multiple 
            onChange={handleFileInput}
          />
          
          <div className="w-16 h-16 rounded-full bg-background border border-border flex items-center justify-center mb-6 shadow-sm">
            {createModel.isPending ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            ) : (
              <UploadCloud className="w-8 h-8 text-primary" />
            )}
          </div>
          
          <h3 className="text-xl font-medium mb-2 text-foreground">Import 3D Models</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Drag and drop your files here, or click to browse. Supported formats: STL, OBJ, PLY, 3MF.
          </p>
          <Button variant="secondary" className="bg-background border-border text-foreground hover:bg-accent hover:text-primary font-medium px-6">
            Select Files
          </Button>
        </div>

        {/* Model Grid */}
        <div>
          <div className="flex items-center gap-2 mb-4 text-lg font-semibold border-b border-border pb-2">
            <Box className="w-5 h-5 text-primary" />
            Project Models
            <span className="ml-2 bg-accent text-muted-foreground text-xs py-0.5 px-2 rounded-full font-mono">
              {models?.length || 0}
            </span>
          </div>
          
          {modelsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square bg-card rounded-lg border border-border animate-pulse" />
              ))}
            </div>
          ) : models?.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-lg border border-border">
              <FileBox className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No models imported yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {models?.map((model) => (
                <div key={model.id} className="group bg-card border border-border rounded-lg overflow-hidden flex flex-col hover:border-primary/50 transition-colors">
                  <div className="aspect-video bg-background/50 relative flex items-center justify-center border-b border-border group-hover:bg-background transition-colors">
                    {/* Placeholder for 3D thumbnail */}
                    <Triangle className="w-16 h-16 text-muted-foreground/20" />
                    
                    <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm border border-border px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-foreground">
                      {model.format}
                    </div>
                    
                    <button 
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(model.id); }}
                      className="absolute top-3 right-3 bg-destructive/10 text-destructive border border-destructive/20 w-7 h-7 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <div className="p-4 flex flex-col flex-1">
                    <h4 className="font-medium text-sm truncate mb-3" title={model.filename}>{model.filename}</h4>
                    
                    <div className="mt-auto space-y-2">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="flex items-center"><Triangle className="w-3 h-3 mr-1" /> Faces</span>
                        <span className="font-mono">{model.faceCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="flex items-center"><Info className="w-3 h-3 mr-1" /> Size</span>
                        <span className="font-mono">{model.fileSizeBytes ? (model.fileSizeBytes / (1024*1024)).toFixed(2) + ' MB' : '-'}</span>
                      </div>
                    </div>
                    
                    <Link href={`/projects/${projectId}`}>
                      <Button className="w-full mt-4 text-xs h-8 bg-secondary hover:bg-primary hover:text-primary-foreground text-secondary-foreground transition-colors border-0">
                        Open in Workspace
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
