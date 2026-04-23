import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { storagePut } from "./storage";

// ═══════════════════════════════════════════════════════════════════════════════
// Patient Management Procedures
// ═══════════════════════════════════════════════════════════════════════════════

const patientRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
      search: z.string().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Call backend API
      const params = new URLSearchParams({
        page: input.page.toString(),
        pageSize: input.pageSize.toString(),
        ...(input.search && { search: input.search }),
        ...(input.sortBy && { sortBy: input.sortBy }),
        ...(input.sortOrder && { sortOrder: input.sortOrder }),
      });

      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/patients?${params}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    }),

  get: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/patients/${input}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch patient");
      return response.json();
    }),

  create: protectedProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      dateOfBirth: z.string().datetime(),
      gender: z.enum(["Male", "Female", "Other"]),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
      mrn: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/patients`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) throw new Error("Failed to create patient");
      return response.json();
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      dateOfBirth: z.string().datetime().optional(),
      gender: z.enum(["Male", "Female", "Other"]).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/patients/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) throw new Error("Failed to update patient");
      return response.json();
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/patients/${input}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to delete patient");
      return { success: true };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Study/Case Management Procedures
// ═══════════════════════════════════════════════════════════════════════════════

const studyRouter = router({
  listByPatient: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/studies/patient/${input}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch studies");
      return response.json();
    }),

  get: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/studies/${input}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch study");
      return response.json();
    }),

  create: protectedProcedure
    .input(z.object({
      patientId: z.string().uuid(),
      studyType: z.enum(["Lateral", "PA", "CBCT"]),
      title: z.string().optional(),
      clinicalNotes: z.string().optional(),
      studyDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/studies`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) throw new Error("Failed to create study");
      return response.json();
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      clinicalNotes: z.string().optional(),
      studyDate: z.string().datetime().optional(),
      studyType: z.enum(["Lateral", "PA", "CBCT"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/studies/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) throw new Error("Failed to update study");
      return response.json();
    }),

  delete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/studies/${input}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to delete study");
      return { success: true };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Image Management Procedures
// ═══════════════════════════════════════════════════════════════════════════════

const imageRouter = router({
  listByStudy: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/images/study/${input}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch images");
      return response.json();
    }),

  get: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/images/${input}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch image");
      return response.json();
    }),

  calibrate: protectedProcedure
    .input(z.object({
      imageId: z.string().uuid(),
      point1: z.object({ x: z.number(), y: z.number() }),
      point2: z.object({ x: z.number(), y: z.number() }),
      knownDistanceMm: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/images/${input.imageId}/calibrate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify({
            point1: input.point1,
            point2: input.point2,
            knownDistanceMm: input.knownDistanceMm,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to calibrate image");
      return response.json();
    }),
  
  upload: protectedProcedure
    .input(z.object({
      studyId: z.string().uuid(),
      fileName: z.string(),
      fileType: z.string(),
      base64Data: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const base64Content = input.base64Data.includes(",") 
        ? input.base64Data.split(",")[1] 
        : input.base64Data;
      const buffer = Buffer.from(base64Content, "base64");
      
      const { key } = await storagePut(
        `studies/${input.studyId}/${input.fileName}`,
        buffer,
        input.fileType
      );

      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify({
            studyId: input.studyId,
            originalName: input.fileName,
            storageKey: key,
            contentType: input.fileType,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to register image: ${errorText}`);
      }
      return response.json();
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Analysis Procedures
// ═══════════════════════════════════════════════════════════════════════════════

const analysisRouter = router({
  detect: protectedProcedure
    .input(z.object({
      imageId: z.string().uuid(),
      analysisType: z.string().default("Steiner"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // AI detection can be heavy; increase timeout to 120s
        const response = await fetch(
          `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/detect/${input.imageId}?type=${input.analysisType}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
              "X-User-Id": ctx.user?.id.toString() || "",
            },
            signal: AbortSignal.timeout(120000), // 120 second timeout
          }
        );

        if (!response.ok) {
          const errorMsg = await response.text();
          console.error(`AI Detection Error [${response.status}]:`, errorMsg);
          throw new Error(errorMsg || "AI Engine failed to process image");
        }

        return response.json();
      } catch (error: any) {
        if (error.name === 'TimeoutError') {
          throw new Error("AI Detection timed out. The engine is taking longer than expected.");
        }
        throw error;
      }
    }),

  getSession: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch session");
      return response.json();
    }),

  getLandmarks: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input}/landmarks`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch landmarks");
      return response.json();
    }),

  updateLandmarks: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      landmarks: z.array(z.object({
        landmarkCode: z.string(),
        x: z.number(),
        y: z.number(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input.sessionId}/landmarks`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify(input.landmarks),
        }
      );

      if (!response.ok) throw new Error("Failed to update landmarks");
      return response.json();
    }),

  adjustLandmark: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      landmarkCode: z.string(),
      x: z.number(),
      y: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input.sessionId}/landmarks/${input.landmarkCode}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify({
            x: input.x,
            y: input.y,
            reason: input.reason,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to adjust landmark");
      return response.json();
    }),

  getMeasurements: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input}/measurements`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch measurements");
      return response.json();
    }),

  getDiagnosis: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input}/diagnosis`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch diagnosis");
      return response.json();
    }),

  getTreatment: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/analysis/sessions/${input}/treatment`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch treatment");
      return response.json();
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Report Procedures
// ═══════════════════════════════════════════════════════════════════════════════

const reportRouter = router({
  generate: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      includeXray: z.boolean().default(true),
      includeLandmarkOverlay: z.boolean().default(true),
      includeMeasurements: z.boolean().default(true),
      includeTreatmentPlan: z.boolean().default(true),
      format: z.enum(["pdf", "docx"]).default("pdf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const response = await fetch(
        `${process.env.BUILT_IN_FORGE_API_URL}/api/reports/sessions/${input.sessionId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
            "X-User-Id": ctx.user?.id.toString() || "",
          },
          body: JSON.stringify({
            includeXray: input.includeXray,
            includeLandmarkOverlay: input.includeLandmarkOverlay,
            includeMeasurements: input.includeMeasurements,
            includeTreatmentPlan: input.includeTreatmentPlan,
            format: input.format,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate report");
      return response.json();
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  patient: patientRouter,
  study: studyRouter,
  image: imageRouter,
  analysis: analysisRouter,
  report: reportRouter,
});

export type AppRouter = typeof appRouter;
