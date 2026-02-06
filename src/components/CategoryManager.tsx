import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, Tag, Image, X, Loader2 } from 'lucide-react';
import { useInventory } from '@/contexts/InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { uploadCategoryImage, deleteCategoryImage, validateImageFile } from '@/lib/imageUtils';



const CategoryManager: React.FC = () => {
  const { categories, addCategory, updateCategory, deleteCategory, loading } = useInventory();
  const { userProfile } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    image: null as File | null
  });

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (submitting) return; // Prevent double submission
    
    if (!userProfile?.company_id) {
      alert('No company associated with your account. Please contact your administrator.');
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = null;
      
      // Handle image upload if provided
      if (formData.image) {
        const validation = validateImageFile(formData.image);
        if (!validation.valid) {
          alert(validation.error);
          setSubmitting(false);
          return;
        }
      }

      // For new categories
      if (!editingCategory) {
        // Create category with or without image
        if (!userProfile?.company_id) {
          throw new Error('No company ID found');
        }

        const categoryData = {
          name: formData.name,
          description: formData.description,
          color: formData.color,
          image_url: null,
          company_id: userProfile.company_id
        };

        // If image is provided, upload it first
        if (formData.image) {
          // We need to create the category first to get the ID, then upload the image
          const newCategory = await addCategory(categoryData);
          imageUrl = await uploadCategoryImage(formData.image, newCategory.id);
          
          if (imageUrl) {
            // Update the category with the image URL
            await updateCategory(newCategory.id, { image_url: imageUrl });
          }
        } else {
          // No image, just create the category
          await addCategory(categoryData);
        }
      } else {
        // For editing existing category
        if (formData.image) {
          // Upload new image
          imageUrl = await uploadCategoryImage(formData.image, editingCategory);
        }
        
        // Update category with new data and image URL
        await updateCategory(editingCategory, { 
          name: formData.name,
          description: formData.description,
          color: formData.color,
          image_url: imageUrl,
          company_id: userProfile?.company_id
        });
      }
      
      setIsDialogOpen(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '', color: '#3B82F6', image: null });
    } catch (error) {
      console.error('Error saving category:', error);
      // Don't close dialog on error so user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category.id);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color,
      image: null
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      deleteCategory(id);
    }
  };

  return (
    <Card className="bg-white shadow-lg">
      {loading ? (
        <CardContent className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading categories...</p>
        </CardContent>
      ) : (
        <>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Category Management
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Add Category</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex gap-2 mt-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          formData.color === color ? 'border-gray-800' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="category-image">Category Image (Optional)</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      id="category-image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setFormData(prev => ({ ...prev, image: file }));
                        }
                      }}
                      className="flex-1"
                    />
                    {formData.image && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{formData.image.name}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFormData(prev => ({ ...prev, image: null }))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button 
                    type="submit" 
                    className="flex-1"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {editingCategory ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      editingCategory ? 'Update' : 'Create'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingCategory(null);
                      setFormData({ name: '', description: '', color: '#3B82F6', image: null });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading categories...</span>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8">
            <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No categories yet</h3>
            <p className="text-gray-500 mb-4">Create your first category to organize your inventory items.</p>
            <Button 
              onClick={() => setIsDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Your First Category</span>
              <span className="sm:hidden">Add Category</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card key={category.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  {/* Category Image */}
                  <div className="mb-3 h-24 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                    {category.image_url ? (
                      <img 
                        src={category.image_url} 
                        alt={category.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <Image className="h-6 w-6 mb-1" />
                        <span className="text-xs">No Image</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-start justify-between mb-3">
                    <Badge style={{ backgroundColor: category.color, color: 'white' }}>
                      {category.name}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(category)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(category.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {category.description && (
                    <p className="text-sm text-gray-600">{category.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Created: {category.createdAt.toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
        </>
      )}
    </Card>
  );
};

export default CategoryManager;