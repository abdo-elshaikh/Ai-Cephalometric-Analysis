import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StudyFormProps {
  patientId: string;
  initialData?: any;
  onSubmit: (data: any) => void;
  isLoading?: boolean;
}

export default function StudyForm({ patientId, initialData, onSubmit, isLoading }: StudyFormProps) {
  const [formData, setFormData] = useState({
    studyType: initialData?.studyType || "Lateral",
    title: initialData?.title || "",
    clinicalNotes: initialData?.clinicalNotes || "",
    studyDate: initialData?.studyDate
      ? new Date(initialData.studyDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      patientId,
      studyType: formData.studyType,
      title: formData.title || undefined,
      clinicalNotes: formData.clinicalNotes || undefined,
      studyDate: new Date(formData.studyDate).toISOString(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* Study Type */}
        <div className="space-y-2">
          <Label htmlFor="studyType">Study Type *</Label>
          <Select value={formData.studyType} onValueChange={(value) => handleChange("studyType", value)}>
            <SelectTrigger id="studyType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Lateral">Lateral</SelectItem>
              <SelectItem value="PA">PA</SelectItem>
              <SelectItem value="CBCT">CBCT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Study Date */}
        <div className="space-y-2">
          <Label htmlFor="studyDate">Study Date *</Label>
          <Input
            id="studyDate"
            type="date"
            value={formData.studyDate}
            onChange={(e) => handleChange("studyDate", e.target.value)}
            required
          />
        </div>

        {/* Title */}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="title">Study Title</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="e.g., Pre-treatment Analysis"
          />
        </div>
      </div>

      {/* Clinical Notes */}
      <div className="space-y-2">
        <Label htmlFor="clinicalNotes">Clinical Notes</Label>
        <Textarea
          id="clinicalNotes"
          value={formData.clinicalNotes}
          onChange={(e) => handleChange("clinicalNotes", e.target.value)}
          placeholder="Relevant clinical information..."
          rows={4}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : initialData ? "Update Study" : "Create Study"}
        </Button>
      </div>
    </form>
  );
}
