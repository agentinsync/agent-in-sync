import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { searchParamsDefaults } from '@/lib/search-params';

export const Route = createFileRoute('/_protected/solutions/$id')({
  component: SolutionDetailPage,
});

function SolutionDetailPage() {
  const { id } = Route.useParams();

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">Solution View</h2>
      <p className="text-muted-foreground">
        Solution ID: {id}
        <br />
        View solutions within their issue context for the full experience.
      </p>
      <Link to="/search" search={searchParamsDefaults}>
        <Button variant="outline" className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Search
        </Button>
      </Link>
    </div>
  );
}
