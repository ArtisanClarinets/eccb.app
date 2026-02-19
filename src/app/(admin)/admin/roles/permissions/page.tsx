import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { formatDate } from '@/lib/date';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Search,
  Users,
  Key,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { PermissionsManagementButton } from './permissions-button';
import { ADMIN_USERS_MANAGE } from '@/app/(admin)/admin/roles/types';

interface SearchParams {
  search?: string;
  resource?: string;
  page?: string;
}

export default async function AdminPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission(ADMIN_USERS_MANAGE);
  const params = await searchParams;

  const search = params.search || '';
  const resourceFilter = params.resource || '';
  const page = parseInt(params.page || '1');
  const limit = 20;

  // Build where clause for filtering
  const where: {
    deletedAt: null;
    OR?: Array<{
      name?: { contains: string };
      email?: { contains: string };
      member?: {
        OR: Array<
          { firstName: { contains: string } } | { lastName: { contains: string } }
        >;
      };
    }>;
    customPermissions?: { some: { permission: { resource: string } } };
  } = { deletedAt: null };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      {
        member: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
          ],
        },
      },
    ];
  }

  if (resourceFilter) {
    where.customPermissions = {
      some: {
        permission: {
          resource: resourceFilter,
        },
      },
    };
  }

  // Fetch users with their roles and custom permissions
  const [users, total, permissions, stats] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                displayName: true,
                type: true,
              },
            },
          },
          orderBy: {
            assignedAt: 'desc',
          },
        },
        customPermissions: {
          include: {
            permission: true,
          },
          orderBy: {
            grantedAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
    prisma.permission.findMany({
      select: {
        id: true,
        name: true,
        resource: true,
        action: true,
        description: true,
      },
      orderBy: {
        resource: 'asc',
      },
    }),
    Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.userPermission.count(),
      prisma.permission.groupBy({
        by: ['resource'],
        _count: true,
      }),
    ]),
  ]);

  const [totalUsers, totalCustomPermissions, resourceStats] = stats;
  const totalPages = Math.ceil(total / limit);

  // Get unique resources for filter
  const resources = [...new Set(permissions.map((p) => p.resource))].sort();

  // Role type colors for badges
  const roleTypeColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    SUPER_ADMIN: 'destructive',
    ADMIN: 'default',
    DIRECTOR: 'default',
    STAFF: 'secondary',
    SECTION_LEADER: 'outline',
    LIBRARIAN: 'outline',
    MUSICIAN: 'outline',
    PUBLIC: 'secondary',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Custom Permissions
          </h1>
          <p className="text-muted-foreground">
            Manage individual user permissions beyond role assignments
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Custom Permission Assignments
            </CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomPermissions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Available Permissions
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{permissions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Permission Resources
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resources.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Resource Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Permission Resources</CardTitle>
          <CardDescription>
            Overview of permissions grouped by resource
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {resourceStats.map((stat) => (
              <div
                key={stat.resource}
                className="flex items-center gap-2 rounded-lg border p-3"
              >
                <Badge variant="outline" className="capitalize">
                  {stat.resource}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {stat._count} permission{stat._count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>User Permissions</CardTitle>
          <CardDescription>
            Search and manage custom permissions for users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search by name or email..."
                defaultValue={search}
                className="pl-9"
              />
            </div>
            <Select name="resource" defaultValue={resourceFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {resources.map((resource) => (
                  <SelectItem key={resource} value={resource}>
                    <span className="capitalize">{resource}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Filter</Button>
          </form>

          {users.length === 0 ? (
            <div className="text-center py-12">
              <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No users found</h3>
              <p className="text-muted-foreground">
                {search || resourceFilter
                  ? 'Try adjusting your search or filters'
                  : 'No users available'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Member Profile</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Custom Permissions</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const displayName = user.member
                      ? `${user.member.firstName} ${user.member.lastName}`
                      : user.name || user.email;

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{displayName}</p>
                            <p className="text-sm text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.member ? (
                            <span className="text-sm">
                              {user.member.firstName} {user.member.lastName}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No profile
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.roles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((userRole) => (
                                <Badge
                                  key={userRole.id}
                                  variant={
                                    roleTypeColors[userRole.role.type] ||
                                    'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {userRole.role.displayName}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No roles
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.customPermissions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.customPermissions
                                .slice(0, 3)
                                .map((up) => (
                                  <Badge
                                    key={up.id}
                                    variant="outline"
                                    className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                  >
                                    {up.permission.name}
                                  </Badge>
                                ))}
                              {user.customPermissions.length > 3 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                >
                                  +{user.customPermissions.length - 3} more
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              None
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <PermissionsManagementButton user={user} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to{' '}
                    {Math.min(page * limit, total)} of {total} users
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/admin/roles/permissions?page=${page - 1}&search=${search}&resource=${resourceFilter}`}
                    >
                      <Button variant="outline" size="sm" disabled={page <= 1}>
                        Previous
                      </Button>
                    </a>
                    <span className="text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <a
                      href={`/admin/roles/permissions?page=${page + 1}&search=${search}&resource=${resourceFilter}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                      >
                        Next
                      </Button>
                    </a>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
