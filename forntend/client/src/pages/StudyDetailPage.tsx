import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Edit, Trash2, Upload, FileImage, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import StudyForm from "@/components/StudyForm";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function StudyDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/studies/:patientId/:studyId");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const patientId = params?.patientId as string;
  const studyId = params?.studyId as string;

  const { data: study, isLoading: isStudyLoading, refetch: refetchStudy } = trpc.study.get.useQuery(studyId, {
    enabled: !!studyId,
  });

  const { data: patient, isLoading: isPatientLoading } = trpc.patient.get.useQuery(patientId, {
    enabled: !!patientId,
  });

  const { data: images, isLoading: isImagesLoading, refetch: refetchImages } = trpc.image.listByStudy.useQuery(studyId, {
    enabled: !!studyId,
  });

  const updateMutation = trpc.study.update.useMutation({
    onSuccess: () => {
      toast.success("Study updated successfully");
      setIsEditOpen(false);
      refetchStudy();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update study");
    },
  });

  const deleteMutation = trpc.study.delete.useMutation({
    onSuccess: () => {
      toast.success("Study deleted successfully");
      navigate(`/patients/${patientId}`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete study");
    },
  });

  const uploadMutation = trpc.image.upload.useMutation({
    onSuccess: () => {
      toast.success("Image uploaded successfully");
      refetchImages();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload image");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      uploadMutation.mutate({
        studyId,
        fileName: file.name,
        fileType: file.type,
        base64Data,
      });
    };
    reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = "";
  };

  if (isStudyLoading || isPatientLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 md:col-span-2 space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-32" /></div>
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-32" /></div>
            </div>
            <Skeleton className="h-24 w-full" />
          </Card>
          <Card className="p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-4">
              <div className="flex justify-between"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /></div>
              <div className="flex justify-between"><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /></div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!study || !patient) {
    return <div className="p-6 text-center">Study or Patient not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/patients/${patientId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{study.title || "Untitled Study"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Patient: {patient.firstName} {patient.lastName} ({patient.mrn})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Study</DialogTitle>
              </DialogHeader>
              <StudyForm
                patientId={patientId}
                initialData={study}
                onSubmit={(data) => updateMutation.mutate({ id: studyId, ...data })}
                isLoading={updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive gap-2"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Study Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Clinical Information</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Study Type</p>
              <p className="font-medium">{study.studyType}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Study Date</p>
              <p className="font-medium">{new Date(study.studyDate).toLocaleDateString()}</p>
            </div>
          </div>
          {study.clinicalNotes && (
            <div className="mt-6 border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">Clinical Notes</p>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {study.clinicalNotes}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Status Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {study.status || "In Progress"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Images</span>
              <span className="font-medium">{images?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{new Date(study.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Images Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">X-Ray Images</h2>
          <div className="flex items-center gap-2">
            {uploadMutation.isPending && (
              <div className="flex items-center gap-2 mr-2 text-sm text-muted-foreground animate-in fade-in slide-in-from-right-2">
                <Spinner className="h-4 w-4" />
                Uploading...
              </div>
            )}
            <Button className="gap-2" onClick={() => document.getElementById("file-upload")?.click()} disabled={uploadMutation.isPending}>
              <Upload className="h-4 w-4" />
              Upload Image
            </Button>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {isImagesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-48 animate-pulse bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : !images || images.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800">
                <FileImage className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No images uploaded yet</p>
                <p className="text-sm text-muted-foreground">Upload an X-ray to begin analysis</p>
              </div>
              <Button variant="outline" size="sm" className="mt-2">
                Upload First Image
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image: any) => (
              <Card
                key={image.id}
                className="group relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                onClick={() => navigate(`/analysis/${studyId}/${image.id}`)}
              >
                <div className="aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
                  {image.thumbnailUrl ? (
                    <img
                      src={image.thumbnailUrl}
                      alt={image.originalName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <FileImage className="h-12 w-12 text-slate-700" />
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={image.originalName}>
                        {image.originalName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(image.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/analysis/${studyId}/${image.id}`);
                        }}>
                          Analyze
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {image.isCalibrated ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        Calibrated
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        Uncalibrated
                      </span>
                    )}
                    {image.hasAnalysis && (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        Analyzed
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Study Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clinical study?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the study "{study.title}" and all uploaded images and analyses.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(studyId)}
            >
              Delete Study
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
