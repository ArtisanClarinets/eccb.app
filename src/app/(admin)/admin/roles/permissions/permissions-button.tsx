'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomPermissionsDialog } from '@/components/admin/roles/custom-permissions-dialog';
import { ShieldCheck } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  member: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  roles: {
    id: string;
    roleId: string;
    role: {
      id: string;
      name: string;
      displayName: string;
      type: string;
    };
  }[];
  customPermissions: {
    id: string;
    userId: string;
    permissionId: string;
    grantedAt: Date;
    grantedBy: string | null;
    expiresAt: Date | null;
    permission: {
      id: string;
      name: string;
      resource: string;
      action: string;
      description: string | null;
    };
  }[];
}

interface PermissionsManagementButtonProps {
  user: User;
}

export function PermissionsManagementButton({
  user,
}: PermissionsManagementButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSuccess = () => {
    // Refresh the page to show updated permissions
    window.location.reload();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className="gap-1"
      >
        <ShieldCheck className="h-4 w-4" />
        Permissions
      </Button>

      <CustomPermissionsDialog
        user={user}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
