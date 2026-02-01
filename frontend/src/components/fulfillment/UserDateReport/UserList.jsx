import { UserRow } from "./UserRow";

export function UserList({ users, dailyLimit }) {
  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 gap-2 p-2 bg-muted/20 text-sm font-medium border-b border-border">
        <div className="w-8"></div>
        <div>User</div>
        <div className="text-right">Hours</div>
        <div className="text-right">Cost</div>
        <div className="text-right">Orders</div>
        <div className="text-right">Items</div>
        <div>Status</div>
      </div>
      
      {/* Rows */}
      <div className="divide-y divide-border">
        {users.map((userData) => (
          <UserRow key={userData.user_id} userData={userData} dailyLimit={dailyLimit} />
        ))}
      </div>
    </div>
  );
}
