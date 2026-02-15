'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getAllPermissions,
  getUserEffectivePermissions,
  batchGrantPermissions,
  batchRevokePermissions,
  type GroupedPermissions,
} from '@/app/(admin)/admin/roles/permissions/actions';
import {
  Key,
  Check,
  X,
  Search,
  Shield,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  email: string;
  name: string | null;
  member: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface CustomPermissionsDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface PermissionState {
  isCustom: boolean;
  source: string;
  permissionId?: string;
}

export function CustomPermissionsDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: CustomPermissionsDialogProps) {
  const [allPermissions, setAllPermissions] = useState<GroupedPermissions>({});
  const [effectivePermissions, setEffectivePermissions] = useState<
    Map<string, PermissionState>
  >(new Map());
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [originalCustomPermissions, setOriginalCustomPermissions] = useState<
    Set<string>
  >(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Load permissions when dialog opens
  useEffect(() => {
    if (open && user) {
      setIsLoading(true);
      Promise.all([getAllPermissions(), getUserEffectivePermissions(user.id)])
        .then(([permissions, effective]) => {
          setAllPermissions(permissions);
          setEffectivePermissions(effective);

          // Extract current custom permissions
          const customPerms = new Set<string>();
          const selectedPerms = new Set<string>();

          effective.forEach((state, permName) => {
            if (state.isCustom) {
              customPerms.add(permName);
              selectedPerms.add(permName);
            }
          });

          setOriginalCustomPermissions(customPerms);
          setSelectedPermissions(selectedPerms);
        })
        .catch((error) => {
          console.error('Failed to load permissions:', error);
          toast.error('Failed to load permissions');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, user]);

  const handlePermissionToggle = (permissionName: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permissionName)) {
        next.delete(permissionName);
      } else {
        next.add(permissionName);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);

    try {
      // Determine permissions to add and remove
      const toAdd = [...selectedPermissions].filter(
        (name) => !originalCustomPermissions.has(name)
      );
      const toRemove = [...originalCustomPermissions].filter(
        (name) => !selectedPermissions.has(name)
      );

      // Get permission IDs for removal
      const permissionIdsToRemove: string[] = [];
      effectivePermissions.forEach((state, permName) => {
        if (toRemove.includes(permName) && state.permissionId) {
          permissionIdsToRemove.push(state.permissionId);
        }
      });

      // Process additions
      if (toAdd.length > 0) {
        const result = await batchGrantPermissions(user.id, toAdd);
        if (!result.success) {
          toast.error(result.error || 'Failed to grant permissions');
          return;
        }
      }

      // Process removals
      if (permissionIdsToRemove.length > 0) {
        const result = await batchRevokePermissions(user.id, permissionIdsToRemove);
        if (!result.success) {
          toast.error(result.error || 'Failed to revoke permissions');
          return;
        }
      }

      const addedCount = toAdd.length;
      const removedCount = permissionIdsToRemove.length;

      if (addedCount > 0 || removedCount > 0) {
        toast.success(
          `Permissions updated: ${addedCount} granted, ${removedCount} revoked`
        );
      } else {
        toast.info('No changes to save');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update permissions:', error);
      toast.error('Failed to update permissions');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter permissions based on search and tab
  const filteredPermissions = useMemo(() => {
    const result: GroupedPermissions = {};

    Object.entries(allPermissions).forEach(([resource, permissions]) => {
      const filtered = permissions.filter((perm) => {
        const matchesSearch =
          searchQuery === '' ||
          perm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          perm.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (perm.description?.toLowerCase().includes(searchQuery.toLowerCase()) ??
            false);

        if (!matchesSearch) return false;

        if (activeTab === 'all') return true;
        if (activeTab === 'custom') {
          return selectedPermissions.has(perm.name);
        }
        if (activeTab === 'role') {
          const state = effectivePermissions.get(perm.name);
          return state && !state.isCustom;
        }
        return true;
      });

      if (filtered.length > 0) {
        result[resource] = filtered;
      }
    });

    return result;
  }, [allPermissions, searchQuery, activeTab, selectedPermissions, effectivePermissions]);

  const hasChanges = useMemo(() => {
    if (selectedPermissions.size !== originalCustomPermissions.size) return true;
    for (const perm of selectedPermissions) {
      if (!originalCustomPermissions.has(perm)) return true;
    }
    return false;
  }, [selectedPermissions, originalCustomPermissions]);

  // Resource display names and colors
  const resourceConfig: Record<
    string,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    music: {
      label: 'Music Library',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      icon: <Key className="h-4 w-4" />,
    },
    member: {
      label: 'Members',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      icon: <Key className="h-4 w-4" />,
    },
    event: {
      label: 'Events',
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      icon: <Key className="h-4 w-4" />,
    },
    attendance: {
      label: 'Attendance',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      icon: <Key className="h-4 w-4" />,
    },
    cms: {
      label: 'Content Management',
      color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      icon: <Key className="h-4 w-4" />,
    },
    announcement: {
      label: 'Announcements',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      icon: <Key className="h-4 w-4" />,
    },
    message: {
      label: 'Messaging',
      color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      icon: <Key className="h-4 w-4" />,
    },
    report: {
      label: 'Reports',
      color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      icon: <Key className="h-4 w-4" />,
    },
    system: {
      label: 'System',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      icon: <Key className="h-4 w-4" />,
    },
    audit: {
      label: 'Audit Logs',
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      icon: <Key className="h-4 w-4" />,
    },
    admin: {
      label: 'Administration',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      icon: <Shield className="h-4 w-4" />,
    },
  };

  const getResourceConfig = (resource: string) => {
    return (
      resourceConfig[resource] || {
        label: resource.charAt(0).toUpperCase() + resource.slice(1),
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        icon: <ShieldQuestion className="h-4 w-4" />,
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Manage Custom Permissions
          </DialogTitle>
          <DialogDescription>
            {user && (
              <span>
                Grant or revoke custom permissions for{' '}
                <strong>
                  {user.member
                    ? `${user.member.firstName} ${user.member.lastName}`
                    : user.name || user.email}
                </strong>
                . Permissions from roles are shown but cannot be modified here.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <>
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search permissions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full sm:w-auto"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="custom">Custom</TabsTrigger>
                  <TabsTrigger value="role">From Roles</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Custom Permission</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>From Role</span>
              </div>
            </div>

            {/* Permission List */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {Object.entries(filteredPermissions).map(([resource, permissions]) => {
                  const config = getResourceConfig(resource);

                  return (
                    <div key={resource} className="space-y-3">
                      <div className="flex items-center gap-2 sticky top-0 bg-background py-1">
                        <Badge className={config.color}>
                          {config.icon}
                          <span className="ml-1">{config.label}</span>
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          ({permissions.length} permission
                          {permissions.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="space-y-2 pl-2">
                        {permissions.map((permission) => {
                          const state = effectivePermissions.get(permission.name);
                          const isFromRole = state && !state.isCustom;
                          const isCustom = state?.isCustom ?? false;
                          const isSelected = selectedPermissions.has(permission.name);
                          const wasOriginallyCustom =
                            originalCustomPermissions.has(permission.name);
                          const isChanged = isSelected !== wasOriginallyCustom;

                          return (
                            <div
                              key={permission.id}
                              className={cn(
                                'flex items-start space-x-3 rounded-lg border p-3 transition-colors',
                                isChanged
                                  ? isSelected
                                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                    : 'border-red-500 bg-red-50 dark:bg-red-950'
                                  : 'border-transparent hover:bg-muted/50',
                                isFromRole && 'opacity-75'
                              )}
                            >
                              <Checkbox
                                id={`perm-${permission.id}`}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  handlePermissionToggle(permission.name)
                                }
                                disabled={isFromRole}
                                className="mt-0.5"
                              />
                              <div className="flex-1 space-y-1">
                                <Label
                                  htmlFor={`perm-${permission.id}`}
                                  className={cn(
                                    'flex items-center gap-2 cursor-pointer',
                                    isFromRole && 'cursor-not-allowed'
                                  )}
                                >
                                  <span className="font-mono text-sm">
                                    {permission.name}
                                  </span>
                                  {isFromRole && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    >
                                      From: {state?.source}
                                    </Badge>
                                  )}
                                  {isCustom && !isChanged && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                    >
                                      Custom
                                    </Badge>
                                  )}
                                  {isChanged && (
                                    <span className="text-xs">
                                      {isSelected ? (
                                        <span className="text-green-600 flex items-center gap-1">
                                          <Check className="h-3 w-3" />
                                          Adding
                                        </span>
                                      ) : (
                                        <span className="text-red-600 flex items-center gap-1">
                                          <X className="h-3 w-3" />
                                          Removing
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </Label>
                                {permission.description && (
                                  <p className="text-sm text-muted-foreground">
                                    {permission.description}
                                  </p>
                                )}
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                  <span>Action: {permission.action}</span>
                                  {permission.scope && (
                                    <span>Scope: {permission.scope}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {Object.keys(filteredPermissions).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No permissions found matching your criteria
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || !hasChanges}
          >
            {isSaving ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
