
const CLOUD_NAME = "r6henkj9";
const UPLOAD_PRESET = "faceboom_upload";

export async function uploadToCloudinary(file) {
  if (!file) {
    throw new Error("Please select a file.");
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new Error("Only images and videos are allowed.");
  }

  const maxSize = isImage
    ? 5 * 1024 * 1024
    : 50 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      isImage
        ? "Images must be 5MB or smaller."
        : "Videos must be 50MB or smaller."
    );
  }

  const resourceType = isVideo ? "video" : "image";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  let response;
  let data;

  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      body: formData
    });

    data = await response.json();
  } catch {
    throw new Error("Upload failed. Please check your internet connection.");
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Cloudinary upload failed."
    );
  }

  if (!data.secure_url) {
    throw new Error("Cloudinary did not return a valid media URL.");
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    type: resourceType
  };
}
