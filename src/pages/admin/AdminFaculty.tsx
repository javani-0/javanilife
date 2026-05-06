/**
 * Admin Faculty Manager
 * =====================
 * Complete CRUD interface for managing faculty members
 * Features:
 * - View all faculty in a grid layout
 * - Add new faculty with image upload
 * - Edit existing faculty
 * - Delete faculty
 * - Toggle active/inactive status
 * - Cloudinary image upload integration
 * - Form validation
 * - Real-time updates
 */

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Faculty,
  FacultyFormData,
  getAllFaculty,
  addFaculty,
  updateFaculty,
  deleteFaculty,
  uploadFacultyImage,
  validateSocialUrls,
} from "@/lib/faculty";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  X,
  User,
  AlertCircle,
  Instagram,
  Youtube,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

const AdminFaculty = () => {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState<FacultyFormData>({
    name: "",
    role: "",
    bio: "",
    imageUrl: "",
    instagram: "",
    youtube: "",
    isActive: true, // always active
    order: 0,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all faculty on mount
  useEffect(() => {
    loadFaculty();
  }, []);

  const loadFaculty = async () => {
    try {
      setLoading(true);
      const data = await getAllFaculty();
      setFaculty(data);
    } catch (error: any) {
      console.error("[Load Faculty Error]", error);
      toast({
        title: "Failed to load faculty",
        description: error?.message || "Check console for details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Open modal for adding new faculty
  const openAddModal = () => {
    setEditingFaculty(null);
    setFormData({
      name: "",
      role: "",
      bio: "",
      imageUrl: "",
      instagram: "",
      youtube: "",
      isActive: true,
      order: faculty.length, // always active
    });
    setImageFile(null);
    setImagePreview("");
    setShowModal(true);
  };

  // Open modal for editing existing faculty
  const openEditModal = (member: Faculty) => {
    setEditingFaculty(member);
    setFormData({
      name: member.name,
      role: member.role,
      bio: member.bio,
      imageUrl: member.imageUrl,
      instagram: member.instagram || "",
      youtube: member.youtube || "",
      isActive: true,
      order: member.order,
    });
    setImageFile(null);
    setImagePreview(member.imageUrl);
    setShowModal(true);
  };

  // Handle image file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 10MB",
        variant: "destructive",
      });
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Validate form before submission
  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return false;
    }
    if (!formData.role.trim()) {
      toast({ title: "Role is required", variant: "destructive" });
      return false;
    }
    if (!formData.bio.trim()) {
      toast({ title: "Bio is required", variant: "destructive" });
      return false;
    }
    if (!editingFaculty && !imageFile) {
      toast({ title: "Profile image is required", variant: "destructive" });
      return false;
    }

    // Validate social URLs
    const urlValidation = validateSocialUrls(formData.instagram, formData.youtube);
    if (!urlValidation.valid) {
      toast({ title: urlValidation.error, variant: "destructive" });
      return false;
    }

    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setUploading(true);
      setUploadProgress(0);

      let imageUrl = formData.imageUrl;

      // Upload new image if selected
      if (imageFile) {
        setUploadProgress(30);
        imageUrl = await uploadFacultyImage(imageFile);
        setUploadProgress(60);
      }

      const facultyData: FacultyFormData = {
        ...formData,
        imageUrl,
        instagram: formData.instagram || undefined,
        youtube: formData.youtube || undefined,
      };

      if (editingFaculty) {
        // Update existing faculty
        await updateFaculty(editingFaculty.id, facultyData);
        toast({ title: "✓ Faculty member updated successfully!" });
      } else {
        // Add new faculty
        await addFaculty(facultyData);
        toast({ title: "✓ Faculty member added successfully!" });
      }

      setUploadProgress(100);
      setShowModal(false);
      loadFaculty(); // Refresh list
    } catch (error: any) {
      console.error("[Submit Error]", error);
      toast({
        title: editingFaculty ? "Failed to update faculty" : "Failed to add faculty",
        description: error?.message || "Check console for details",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete faculty member
  const handleDelete = async (member: Faculty) => {
    if (!confirm(`Delete ${member.name}? This action cannot be undone.`)) return;

    try {
      await deleteFaculty(member.id);
      toast({ title: "✓ Faculty member deleted" });
      loadFaculty();
    } catch (error: any) {
      toast({
        title: "Failed to delete faculty",
        description: error?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-[2rem] text-foreground mb-2">
            Faculty Manager
          </h1>
          <p className="font-body text-muted-foreground">
            Manage faculty members displayed on the About page
          </p>
        </div>
        <Button
          onClick={openAddModal}
          className="bg-gold hover:bg-gold-dark text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Faculty
        </Button>
      </div>

      {/* Faculty Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-body text-sm text-muted-foreground">Loading faculty...</p>
          </div>
        </div>
      ) : faculty.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-lg border border-border">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-display text-lg text-foreground mb-2">No Faculty Members</h3>
          <p className="font-body text-sm text-muted-foreground mb-4">
            Add your first faculty member to get started
          </p>
          <Button onClick={openAddModal} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Add Faculty
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {faculty.map((member) => (
            <div
              key={member.id}
              className="bg-card rounded-lg border border-border p-4 transition-all hover:shadow-lg"
            >
              {/* Profile Image */}
              <div className="w-32 h-32 mx-auto mb-4">
                <img
                  src={member.imageUrl}
                  alt={member.name}
                  className="w-full h-full object-cover rounded-full ring-4 ring-gold/20"
                  onError={(e) => {
                    e.currentTarget.src = "https://via.placeholder.com/150?text=No+Image";
                  }}
                />
              </div>

              {/* Faculty Info */}
              <h3 className="font-display font-bold text-center text-foreground mb-1">
                {member.name}
              </h3>
              <p className="font-body text-sm text-muted-foreground text-center mb-3">
                {member.role}
              </p>
              <p className="font-body text-xs text-muted-foreground line-clamp-2 mb-4">
                {member.bio}
              </p>

              {/* Social Links */}
              <div className="flex justify-center gap-2 mb-4">
                {member.instagram && (
                  <a
                    href={member.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:text-gold-dark"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {member.youtube && (
                  <a
                    href={member.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:text-gold-dark"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Youtube className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => openEditModal(member)}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
                <Button
                  onClick={() => handleDelete(member)}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !uploading && setShowModal(false)}
        >
          <div
            className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-display font-bold text-xl text-foreground">
                {editingFaculty ? "Edit Faculty Member" : "Add New Faculty Member"}
              </h2>
              <button
                onClick={() => !uploading && setShowModal(false)}
                disabled={uploading}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Profile Photo *</Label>
                <div className="flex items-start gap-4">
                  {/* Preview */}
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <User className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Upload Button */}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full"
                      disabled={uploading}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {imageFile ? "Change Image" : "Upload Image"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Recommended: Square image, min 500x500px, max 10MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Vanitha Haribabu"
                  disabled={uploading}
                  required
                />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">Role/Title *</Label>
                <Input
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="e.g., Senior Faculty – Kuchipudi & Nattuvangam"
                  disabled={uploading}
                  required
                />
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio">Bio/Description *</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Brief description of experience, expertise, and teaching approach..."
                  rows={4}
                  disabled={uploading}
                  required
                />
              </div>

              {/* Instagram */}
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram Profile URL (Optional)</Label>
                <div className="flex gap-2">
                  <Instagram className="w-5 h-5 text-muted-foreground mt-2" />
                  <Input
                    id="instagram"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="https://instagram.com/username"
                    disabled={uploading}
                  />
                </div>
              </div>

              {/* YouTube */}
              <div className="space-y-2">
                <Label htmlFor="youtube">YouTube Channel URL (Optional)</Label>
                <div className="flex gap-2">
                  <Youtube className="w-5 h-5 text-muted-foreground mt-2" />
                  <Input
                    id="youtube"
                    value={formData.youtube}
                    onChange={(e) => setFormData({ ...formData, youtube: e.target.value })}
                    placeholder="https://youtube.com/@channel"
                    disabled={uploading}
                  />
                </div>
              </div>

              {/* Order */}
              <div className="space-y-2">
                <Label htmlFor="order">Display Order</Label>
                <Input
                  id="order"
                  type="number"
                  value={formData.order}
                  onChange={(e) =>
                    setFormData({ ...formData, order: parseInt(e.target.value) || 0 })
                  }
                  disabled={uploading}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first (0, 1, 2, ...)
                </p>
              </div>

              {/* Upload Progress */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4" />
                    <span>
                      {uploadProgress < 60 ? "Uploading image..." : "Saving to database..."}
                    </span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  onClick={() => setShowModal(false)}
                  variant="outline"
                  className="flex-1"
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-gold hover:bg-gold-dark text-white"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>Processing...</>
                  ) : editingFaculty ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Update Faculty
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Faculty
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFaculty;
