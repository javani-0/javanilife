/**
 * Faculty Management Helper Functions
 * ===================================
 * Production-ready Firestore CRUD operations for faculty members
 * 
 * Collection: faculty
 * Document Schema: {
 *   name: string,
 *   role: string,
 *   bio: string,
 *   imageUrl: string,
 *   instagram?: string,
 *   youtube?: string,
 *   isActive: boolean,
 *   order: number,
 *   createdAt: timestamp,
 *   updatedAt: timestamp
 * }
 */

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary";

// ===================================
// TypeScript Interfaces
// ===================================

export interface Faculty {
  id: string;
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
  instagram?: string;
  youtube?: string;
  isActive: boolean;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FacultyFormData {
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
  instagram?: string;
  youtube?: string;
  isActive: boolean;
  order: number;
}

// ===================================
// Cloudinary Upload Function
// ===================================

/**
 * Uploads an image file to Cloudinary using unsigned upload preset
 * @param file - Image file to upload
 * @returns Promise with secure_url of uploaded image
 * @throws Error if upload fails or no secure_url returned
 */
export const uploadFacultyImage = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "faculty"); // Organize in Cloudinary

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.secure_url) {
      const errorMsg =
        data.error?.message ||
        "Upload failed. Verify Cloudinary upload preset is set to UNSIGNED.";
      console.error("[Cloudinary Upload Error]", data);
      throw new Error(errorMsg);
    }

    console.log("[Cloudinary Success]", data.secure_url);
    return data.secure_url;
  } catch (error: any) {
    console.error("[Upload Exception]", error);
    throw new Error(error?.message || "Failed to upload image to Cloudinary");
  }
};

// ===================================
// CRUD Operations
// ===================================

/**
 * Add a new faculty member to Firestore
 * @param facultyData - Faculty member data (without timestamps)
 * @returns Document ID of created faculty member
 */
export const addFaculty = async (
  facultyData: FacultyFormData
): Promise<string> => {
  try {
    // Validate required fields
    if (!facultyData.name?.trim()) {
      throw new Error("Name is required");
    }
    if (!facultyData.role?.trim()) {
      throw new Error("Role is required");
    }
    if (!facultyData.bio?.trim()) {
      throw new Error("Bio is required");
    }
    if (!facultyData.imageUrl?.trim()) {
      throw new Error("Profile image is required");
    }

    const docRef = await addDoc(collection(db, "faculty"), {
      ...facultyData,
      name: facultyData.name.trim(),
      role: facultyData.role.trim(),
      bio: facultyData.bio.trim(),
      instagram: facultyData.instagram?.trim() || "",
      youtube: facultyData.youtube?.trim() || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("[Faculty Created]", docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error("[Add Faculty Error]", error);
    throw new Error(error?.message || "Failed to add faculty member");
  }
};

/**
 * Update an existing faculty member
 * @param id - Document ID of faculty member
 * @param facultyData - Updated faculty data
 */
export const updateFaculty = async (
  id: string,
  facultyData: Partial<FacultyFormData>
): Promise<void> => {
  try {
    const docRef = doc(db, "faculty", id);
    
    // Clean up data before updating
    const cleanData: any = {
      ...facultyData,
      updatedAt: serverTimestamp(),
    };

    // Trim string fields if they exist
    if (cleanData.name !== undefined) cleanData.name = cleanData.name.trim();
    if (cleanData.role !== undefined) cleanData.role = cleanData.role.trim();
    if (cleanData.bio !== undefined) cleanData.bio = cleanData.bio.trim();
    if (cleanData.instagram !== undefined) cleanData.instagram = cleanData.instagram.trim();
    if (cleanData.youtube !== undefined) cleanData.youtube = cleanData.youtube.trim();

    await updateDoc(docRef, cleanData);
    console.log("[Faculty Updated]", id);
  } catch (error: any) {
    console.error("[Update Faculty Error]", error);
    throw new Error(error?.message || "Failed to update faculty member");
  }
};

/**
 * Delete a faculty member
 * @param id - Document ID of faculty member to delete
 */
export const deleteFaculty = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "faculty", id));
    console.log("[Faculty Deleted]", id);
  } catch (error: any) {
    console.error("[Delete Faculty Error]", error);
    throw new Error(error?.message || "Failed to delete faculty member");
  }
};

/**
 * Toggle active status of a faculty member
 * @param id - Document ID
 * @param isActive - New active status
 */
export const toggleFacultyActive = async (
  id: string,
  isActive: boolean
): Promise<void> => {
  try {
    await updateDoc(doc(db, "faculty", id), {
      isActive,
      updatedAt: serverTimestamp(),
    });
    console.log("[Faculty Active Status Updated]", id, isActive);
  } catch (error: any) {
    console.error("[Toggle Active Error]", error);
    throw new Error(error?.message || "Failed to update active status");
  }
};

/**
 * Fetch all faculty members (admin view)
 * @returns Array of all faculty members sorted by order
 */
export const getAllFaculty = async (): Promise<Faculty[]> => {
  try {
    const q = query(collection(db, "faculty"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    
    const faculty = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Faculty[];

    console.log("[Fetched All Faculty]", faculty.length, "members");
    return faculty;
  } catch (error: any) {
    console.error("[Fetch All Faculty Error]", error);
    // If error is due to missing index, provide helpful message
    if (error.code === "failed-precondition") {
      throw new Error(
        "Firestore index required. Check console for index creation link."
      );
    }
    throw new Error(error?.message || "Failed to fetch faculty");
  }
};

/**
 * Fetch only active faculty members (public view)
 * @returns Array of active faculty sorted by order
 */
export const getActiveFaculty = async (): Promise<Faculty[]> => {
  try {
    // Only filter by isActive — sort client-side to avoid needing a composite index
    const q = query(
      collection(db, "faculty"),
      where("isActive", "==", true)
    );
    const snapshot = await getDocs(q);
    
    const faculty = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Faculty[];

    // Sort by order client-side
    faculty.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    console.log("[Fetched Active Faculty]", faculty.length, "members");
    return faculty;
  } catch (error: any) {
    console.error("[Fetch Active Faculty Error]", error);
    if (error.code === "failed-precondition") {
      throw new Error(
        "Firestore index required. Check console for index creation link."
      );
    }
    throw new Error(error?.message || "Failed to fetch active faculty");
  }
};

// ===================================
// Validation Helpers
// ===================================

/**
 * Validate URL format
 */
export const isValidUrl = (url: string): boolean => {
  if (!url) return true; // Empty is valid (optional field)
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate social media URLs
 */
export const validateSocialUrls = (
  instagram?: string,
  youtube?: string
): { valid: boolean; error?: string } => {
  if (instagram && !isValidUrl(instagram)) {
    return { valid: false, error: "Invalid Instagram URL" };
  }
  if (youtube && !isValidUrl(youtube)) {
    return { valid: false, error: "Invalid YouTube URL" };
  }
  return { valid: true };
};
