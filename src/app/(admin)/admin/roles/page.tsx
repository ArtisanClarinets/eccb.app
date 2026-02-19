import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { formatDate } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  UserCheck,
  Key,
} from 'lucide-react';
import { RoleAssignmentButton } from './role-assignment-button';
import { ADMIN_USERS_MANAGE } from './types';

interface SearchParams {
  search?: string;
  role?: string;
  page?: string;
}

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

export default async function AdminRolesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission(ADMIN_USERS_MANAGE);
  const params = await searchParams;

  const search = params.search || '';
  const roleFilter = params.role || '';
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
    roles?: { some: { roleId: string } };
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

  if (roleFilter) {
    where.roles = { some: { roleId: roleFilter } };
  }

  // Fetch users with their roles and member info
  const [users, total, roles, stats] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
          orderBy: {
            assignedAt: 'desc',
          },
        },
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
    prisma.role.findMany({
      select: {
        id: true,
        name: true,
        displayName: true,
        type: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: {
        type: 'asc',
      },
    }),
    prisma.userRole.groupBy({
      by: ['roleId'],
      _count: true,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Calculate stats
  const totalUsers = await prisma.user.count({ where: { deletedAt: null } });
  const usersWithRoles = await prisma.user.count({
    where: {
      deletedAt: null,
      roles: { some: {} },
    },
  });
  const totalRoles = roles.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
          <p className="text-muted-foreground">
            Assign and manage user roles and permissions
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
            <CardTitle className="text-sm font-medium">Users with Roles</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usersWithRoles}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Available Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRoles}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Assignments</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.reduce((acc, s) => acc + s._count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Role Summary</CardTitle>
          <CardDescription>Overview of all available roles and their assignments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {roles.map((role) => {
              const count = stats.find((s) => s.roleId === role.id)?._count || 0;
              return (
                <div
                  key={role.id}
                  className="flex items-center gap-2 rounded-lg border p-3"
                >
                  <Badge variant={roleTypeColors[role.type] || 'secondary'}>
                    {role.displayName}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {count} user{count !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>User Roles</CardTitle>
          <CardDescription>Search and manage role assignments for users</CardDescription>
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
            <Select name="role" defaultValue={roleFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Filter</Button>
          </form>

          {users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No users found</h3>
              <p className="text-muted-foreground">
                {search || roleFilter
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
                    <TableHead>Assigned Roles</TableHead>
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
                                    roleTypeColors[userRole.role.type] || 'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {userRole.role.displayName}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No roles assigned
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RoleAssignmentButton user={user} />
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
                      href={`/admin/roles?page=${page - 1}&search=${search}&role=${roleFilter}`}
                    >
                      <Button variant="outline" size="sm" disabled={page <= 1}>
                        Previous
                      </Button>
                    </a>
                    <span className="text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <a
                      href={`/admin/roles?page=${page + 1}&search=${search}&role=${roleFilter}`}
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
