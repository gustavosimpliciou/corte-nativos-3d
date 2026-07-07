import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useListProjects, useGetDashboardStats, useGetRecentActivity, useCreateProject, useDeleteProject, useHealthCheck } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { FolderDot, Plus, Search, FileBox, Activity as ActivityIcon, Clock, HardDrive, Download, AlertCircle, RefreshCw, Triangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useListProjects();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });
  const { data: health } = useHealthCheck();
  
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();

  const handleCreateProject = () => {
    const name = `Project ${format(new Date(), 'yyyyMMdd-HHmm')}`;
    createProject.mutate(
      { data: { name, description: 'New 3D prep workspace' } },
      {
        onSuccess: (project) => {
          toast({ title: 'Project created', description: `Opening ${project.name}` });
          setLocation(`/projects/${project.id}`);
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to create project', variant: 'destructive' });
        }
      }
    );
  };

  const filteredProjects = projects?.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) || [];

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto">
      <header className="flex-shrink-0 px-8 py-6 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your 3D models and cutting operations.</p>
        </div>
        <Button onClick={handleCreateProject} disabled={createProject.isPending} className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20">
          {createProject.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          New Project
        </Button>
      </header>

      <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Projects" 
            value={stats?.totalProjects ?? 0} 
            icon={FolderDot} 
            loading={statsLoading} 
          />
          <StatCard 
            title="Imported Models" 
            value={stats?.totalModels ?? 0} 
            icon={Triangle} 
            loading={statsLoading} 
          />
          <StatCard 
            title="Operations Performed" 
            value={stats?.totalOperations ?? 0} 
            icon={ActivityIcon} 
            loading={statsLoading} 
          />
          <StatCard 
            title="Exports" 
            value={stats?.totalExports ?? 0} 
            icon={Download} 
            loading={statsLoading} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Projects List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center">
                <FileBox className="w-5 h-5 mr-2 text-primary" />
                Active Projects
              </h2>
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search projects..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-card border-border h-9 text-sm"
                />
              </div>
            </div>

            {projectsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-32 rounded-lg bg-card animate-pulse border border-border" />
                ))}
              </div>
            ) : filteredProjects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="group border border-border bg-card hover:bg-accent/30 rounded-lg p-5 transition-all cursor-pointer hover:border-primary/50 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-medium text-base truncate pr-4 group-hover:text-primary transition-colors">{project.name}</h3>
                        <span className="text-xs text-muted-foreground whitespace-nowrap bg-background px-2 py-1 rounded border border-border">
                          {format(new Date(project.updatedAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                      
                      <div className="mt-auto flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Triangle className="w-4 h-4 mr-1.5 opacity-70" />
                          {project.modelCount} models
                        </div>
                        <div className="flex items-center">
                          <ActivityIcon className="w-4 h-4 mr-1.5 opacity-70" />
                          {project.operationCount} ops
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-border rounded-lg bg-card">
                <FolderDot className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-foreground mb-2">No projects found</h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Get started by creating a new project to import and prepare your 3D models.
                </p>
                <Button onClick={handleCreateProject} variant="outline" className="mt-6 border-primary text-primary hover:bg-primary/10">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center">
              <Clock className="w-5 h-5 mr-2 text-primary" />
              Recent Activity
            </h2>
            <div className="border border-border bg-card rounded-lg p-1 overflow-hidden h-[calc(100vh-[400px])] min-h-[300px] flex flex-col">
              {activityLoading ? (
                <div className="p-4 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-background animate-pulse flex-shrink-0" />
                      <div className="space-y-2 flex-1 pt-1">
                        <div className="h-3 w-3/4 bg-background animate-pulse rounded" />
                        <div className="h-2 w-1/4 bg-background animate-pulse rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity && activity.length > 0 ? (
                <div className="overflow-y-auto p-4 space-y-5">
                  {activity.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 text-muted-foreground border border-border">
                        {item.type.includes('project') ? <FolderDot className="w-4 h-4" /> :
                         item.type.includes('model') ? <Triangle className="w-4 h-4" /> :
                         item.type.includes('export') ? <Download className="w-4 h-4" /> :
                         <ActivityIcon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-foreground leading-snug">
                          {item.description}
                        </p>
                        <div className="flex items-center mt-1 text-xs text-muted-foreground">
                          {format(new Date(item.createdAt), 'MMM d, h:mm a')}
                          {item.projectName && (
                            <>
                              <span className="mx-1.5">•</span>
                              <span className="text-primary/80">{item.projectName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <ActivityIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-muted-foreground">No recent activity.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, loading }: { title: string, value: number, icon: any, loading: boolean }) {
  return (
    <div className="bg-card border border-border p-5 rounded-lg flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        {loading ? (
          <div className="h-8 w-16 bg-accent animate-pulse rounded mt-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
        )}
      </div>
      <div className="w-12 h-12 bg-accent/50 rounded-full flex items-center justify-center">
        <Icon className="w-6 h-6 text-primary" />
      </div>
    </div>
  );
}
