// A field marked readOnly is only locked when its value is the signed-in account's own (verified) value, never because someone has typed in it.
export const isLocked = (field, value, accountValue) =>
  Boolean(
    field?.readOnly &&
    accountValue &&
    String(value || '')
      .trim()
      .toLowerCase() === String(accountValue).trim().toLowerCase(),
  );
