import React from 'react';

/** Big, readable message box under a form: red for problems, green for good news. */
export const FormAlert: React.FC<{ error?: string | null; info?: string | null }> = ({ error, info }) => {
  if (!error && !info) return null;
  return error ? (
    <div role="alert" className="rounded-md border-2 border-red-700 bg-red-50 p-3 text-base text-red-900">
      {error}
    </div>
  ) : (
    <div role="status" className="rounded-md border-2 border-green-700 bg-green-50 p-3 text-base text-green-900">
      {info}
    </div>
  );
};
