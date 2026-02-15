'use client';

import { useState, useEffect } from 'react';
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
import {
  assignRole,
  removeRole,
  getAvailableRoles,
} from '@/app/(admin)/admin/roles/actions';
import type { UserWithRoles, RoleWithPermissions } from '@/app/(admin)/admin/roles/types';
import { Shield, Check, X } from 'lucide-react';

interface RoleAssignmentDialogProps {
  user: UserWithRoles | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RoleAssignmentDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: RoleAssignmentDialogProps) {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [originalRoles, setOriginalRoles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load available roles when dialog opens
  useEffect(() => {
    if (open && user) {
      setIsLoading(true);
      getAvailableRoles()
        .then((availableRoles) => {
          setRoles(availableRoles);
          // Set currently assigned roles
          const currentRoleIds = new Set(user.roles.map((r) => r.roleId));
          setSelectedRoles(currentRoleIds);
          setOriginalRoles(currentRoleIds);
        })
        .catch((error) => {
          console.error('Failed to load roles:', error);
          toast.error('Failed to load available roles');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, user]);

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);

    try {
      // Determine roles to add and remove
      const rolesToAdd = [...selectedRoles].filter(
        (id) => !originalRoles.has(id)
      );
      const rolesToRemove = [...originalRoles].filter(
        (id) => !selectedRoles.has(id)
      );

      // Process additions
      for (const roleId of rolesToAdd) {
        const result = await assignRole(user.id, roleId);
        if (!result.success) {
          toast.error(result.error || 'Failed to assign role');
          return;
        }
      }

      // Process removals
      for (const roleId of rolesToRemove) {
        const result = await removeRole(user.id, roleId);
        if (!result.success) {
          toast.error(result.error || 'Failed to remove role');
          return;
        }
      }

      toast.success('Roles updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update roles:', error);
      toast.error('Failed to update roles');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    selectedRoles.size !== originalRoles.size ||
    [...selectedRoles].some((id) => !originalRoles.has(id)) ||
    [...originalRoles].some((id) => !selectedRoles.has(id));

  // Group roles by type
  const groupedRoles = roles.reduce(
    (acc, role) => {
      const type = role.type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(role);
      return acc;
    },
    {} as Record<string, RoleWithPermissions[]>
  );

  const roleTypeOrder = [
    'SUPER_ADMIN',
    'ADMIN',
    'DIRECTOR',
    'STAFF',
    'SECTION_LEADER',
    'LIBRARIAN',
    'MUSICIAN',
    'PUBLIC',
  ];

  const getRoleTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      SUPER_ADMIN: 'Super Admin',
      ADMIN: 'Administrators',
      DIRECTOR: 'Directors',
      STAFF: 'Staff',
      SECTION_LEADER: 'Section Leaders',
      LIBRARIAN: 'Librarians',
      MUSICIAN: 'Musicians',
      PUBLIC: 'Public',
    };
    return labels[type] || type;
  };

  const getRoleTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      SUPER_ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      ADMIN: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      DIRECTOR: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      STAFF: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      SECTION_LEADER: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
      LIBRARIAN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      MUSICIAN: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      PUBLIC: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage User Roles
          </DialogTitle>
          <DialogDescription>
            {user && (
              <span>
                Assign or remove roles for{' '}
                <strong>
                  {user.member
                    ? `${user.member.firstName} ${user.member.lastName}`
                    : user.name || user.email}
                </strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {roleTypeOrder.map((type) => {
                const typeRoles = groupedRoles[type];
                if (!typeRoles || typeRoles.length === 0) return null;

                return (
                  <div key={type} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className={getRoleTypeColor(type)}>
                        {getRoleTypeLabel(type)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        ({typeRoles.length} role{typeRoles.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="space-y-2 pl-2">
                      {typeRoles.map((role) => {
                        const isSelected = selectedRoles.has(role.id);
                        const wasOriginallyAssigned = originalRoles.has(role.id);
                        const isChanged = isSelected !== wasOriginallyAssigned;

                        return (
                          <div
                            key={role.id}
                            className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                              isChanged
                                ? isSelected
                                  ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                  : 'border-red-500 bg-red-50 dark:bg-red-950'
                                : 'border-transparent hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              id={`role-${role.id}`}
                              checked={isSelected}
                              onCheckedChange={() => handleRoleToggle(role.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                              <Label
                                htmlFor={`role-${role.id}`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <span className="font-medium">
                                  {role.displayName}
                                </span>
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
                              {role.description && (
                                <p className="text-sm text-muted-foreground">
                                  {role.description}
                                </p>
                              )}
                              {role.permissions.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {role.permissions.slice(0, 5).map((p) => (
                                    <Badge
                                      key={p.id}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {p.permission.name}
                                    </Badge>
                                  ))}
                                  {role.permissions.length > 5 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{role.permissions.length - 5} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Other roles not in the predefined order */}
              {Object.entries(groupedRoles)
                .filter(([type]) => !roleTypeOrder.includes(type))
                .map(([type, typeRoles]) => (
                  <div key={type} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-100 text-gray-800">
                        {type}
                      </Badge>
                    </div>
                    <div className="space-y-2 pl-2">
                      {typeRoles.map((role) => {
                        const isSelected = selectedRoles.has(role.id);
                        const wasOriginallyAssigned = originalRoles.has(role.id);
                        const isChanged = isSelected !== wasOriginallyAssigned;

                        return (
                          <div
                            key={role.id}
                            className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                              isChanged
                                ? isSelected
                                  ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                  : 'border-red-500 bg-red-50 dark:bg-red-950'
                                : 'border-transparent hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              id={`role-${role.id}`}
                              checked={isSelected}
                              onCheckedChange={() => handleRoleToggle(role.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                              <Label
                                htmlFor={`role-${role.id}`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <span className="font-medium">
                                  {role.displayName}
                                </span>
                              </Label>
                              {role.description && (
                                <p className="text-sm text-muted-foreground">
                                  {role.description}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
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
