-- Add background field to parties table
ALTER TABLE parties ADD COLUMN background TEXT DEFAULT 'new-years-eve.jpg';

-- Add check constraint for valid background values
ALTER TABLE parties ADD CONSTRAINT parties_background_check 
  CHECK (background IN ('art-deco.jpg', 'berlin.jpg', 'cossonay.jpg', 'new-years-eve.jpg'));
