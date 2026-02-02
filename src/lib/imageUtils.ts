import { supabase } from './supabase';

export const uploadItemImage = async (file: File, itemId: string): Promise<string | null> => {
  try {
    // Create a unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${itemId}-${Date.now()}.${fileExt}`;
    const filePath = `item-images/${fileName}`;

    // Upload file to Supabase storage
    const { data, error } = await supabase.storage
      .from('item-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading image:', error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('item-images')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadItemImage:', error);
    return null;
  }
};

export const deleteItemImage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract file path from URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/');
    const filePath = pathParts.slice(pathParts.indexOf('item-images')).join('/');

    const { error } = await supabase.storage
      .from('item-images')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteItemImage:', error);
    return false;
  }
};

export const uploadCategoryImage = async (file: File, categoryId: string): Promise<string | null> => {
  try {
    // Create a unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${categoryId}-${Date.now()}.${fileExt}`;
    const filePath = `category-images/${fileName}`;

    // Upload file to Supabase storage
    const { data, error } = await supabase.storage
      .from('category-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading category image:', error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('category-images')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadCategoryImage:', error);
    return null;
  }
};

export const deleteCategoryImage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract file path from URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/');
    const filePath = pathParts.slice(pathParts.indexOf('category-images')).join('/');

    const { error } = await supabase.storage
      .from('category-images')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting category image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteCategoryImage:', error);
    return false;
  }
};

export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Please upload a JPEG, PNG, or WebP image' };
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return { valid: false, error: 'Image size must be less than 5MB' };
  }

  return { valid: true };
};
