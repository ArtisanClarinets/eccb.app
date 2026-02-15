'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RoleAssignmentDialog } from '@/components/admin/roles/role-assignment-dialog';
import { Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { UserWithRoles } from './types';

interface RoleAssignmentButtonProps {
  user: UserWithRoles;
}

export function RoleAssignmentButton({ user }: RoleAssignmentButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    router.refresh();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className="gap-2"
      >
        <Shield className="h-4 w-4" />
        Manage Roles
      </Button>

      <RoleAssignmentDialog
        user={user}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
