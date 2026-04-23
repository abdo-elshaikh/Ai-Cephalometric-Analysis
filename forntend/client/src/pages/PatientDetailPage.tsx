import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import StudyForm from "@/components/StudyForm";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/patients/:id");
  const [isCreateStudyOpen, setIsCreateStudyOpen] = useState(false);

  const patientId = params?.id as string;

  const { data: patient, isLoading } = trpc.patient.get.useQuery(patientId, {
    enabled: !!patientId,
  });

  const { data: studies } = trpc.study.listByPatient.useQuery(patientId, {
    enabled: !!patientId,
  });

  const createStudyMutation = trpc.study.create.useMutation({
    onSuccess: () => {
      toast.success("Study created successfully");
      setIsCreateStudyOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create study");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!patient) {
    return <div className="p-6 text-center">Patient not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/patients")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">MRN: {patient.mrn}</p>
        </div>
      </div>

      {/* Patient Info */}
      <Card className="p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Date of Birth</p>
            <p className="text-lg font-medium">
              {new Date(patient.dateOfBirth).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gender</p>
            <p className="text-lg font-medium">{patient.gender}</p>
          </div>
          {patient.phone && (
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="text-lg font-medium">{patient.phone}</p>
            </div>
          )}
          {patient.email && (
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="text-lg font-medium">{patient.email}</p>
            </div>
          )}
        </div>
        {patient.notes && (
          <div className="mt-6 border-t border-border pt-6">
            <p className="text-sm text-muted-foreground">Clinical Notes</p>
            <p className="mt-2 text-sm">{patient.notes}</p>
          </div>
        )}
      </Card>

      {/* Studies Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Studies</h2>
          <Dialog open={isCreateStudyOpen} onOpenChange={setIsCreateStudyOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Study
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Study</DialogTitle>
              </DialogHeader>
              <StudyForm
                patientId={patientId}
                onSubmit={(data: any) => createStudyMutation.mutate(data)}
                isLoading={createStudyMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {!studies || studies.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No studies found for this patient</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {studies.map((study: any) => (
              <Card
                key={study.id}
                className="cursor-pointer p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                onClick={() => navigate(`/studies/${patientId}/${study.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{study.title || "Untitled Study"}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Type: {study.studyType} • Date: {new Date(study.studyDate).toLocaleDateString()}
                    </p>
                    {study.clinicalNotes && (
                      <p className="mt-2 text-sm">{study.clinicalNotes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {study.status || "Pending"}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
