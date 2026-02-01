import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/date';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Music,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Eye,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const metadata: Metadata = {
  title: 'Music Library',
};

async function getMusicPieces() {
  return prisma.musicPiece.findMany({
    where: { deletedAt: null },
    orderBy: { title: 'asc' },
    include: {
      composer: true,
      arranger: true,
      publisher: true,
      files: true,
      _count: {
        select: {
          assignments: true,
          eventMusic: true,
        },
      },
    },
  });
}

const difficultyColors: Record<string, string> = {
  GRADE_1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  GRADE_2: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
  GRADE_3: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  GRADE_4: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  GRADE_5: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  GRADE_6: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default async function AdminMusicPage() {
  const pieces = await getMusicPieces();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Music Library</h1>
          <p className="text-muted-foreground">
            Manage the band's music catalog.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/music/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Music
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Pieces</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pieces.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pieces.filter(p => p.files.length > 0).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pieces.filter(p => p._count.assignments > 0).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Programs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pieces.filter(p => p._count.eventMusic > 0).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, composer, arranger..."
                className="pl-9"
              />
            </div>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Music Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Composer / Arranger</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Assignments</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pieces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16">
                    <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium">No Music Yet</h3>
                    <p className="text-muted-foreground mt-1">
                      Add your first piece to the library.
                    </p>
                    <Button className="mt-4" asChild>
                      <Link href="/admin/music/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Music
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                pieces.map((piece) => (
                  <TableRow key={piece.id}>
                    <TableCell>
                      <div>
                        <Link 
                          href={`/admin/music/${piece.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {piece.title}
                        </Link>
                        {piece.subtitle && (
                          <p className="text-sm text-muted-foreground">
                            {piece.subtitle}
                          </p>
                        )}
                        {piece.catalogNumber && (
                          <p className="text-xs text-muted-foreground">
                            #{piece.catalogNumber}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {piece.composer && <div>{piece.composer.fullName}</div>}
                        {piece.arranger && (
                          <div className="text-muted-foreground">
                            arr. {piece.arranger.fullName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {piece.difficulty && (
                        <Badge className={difficultyColors[piece.difficulty]}>
                          {piece.difficulty.replace('_', ' ')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{piece.files.length}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {piece._count.assignments}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/music/${piece.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/music/${piece.id}/edit`}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/music/${piece.id}/assign`}>
                              <Download className="mr-2 h-4 w-4" />
                              Assign to Members
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
