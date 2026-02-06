import { ProductionUserRow } from "./UserRow";

export function ProductionUserList({ users, dailyLimit }) {
  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-6 gap-2 p-2 bg-muted/20 text-sm font-medium border-b border-border">
        <div className="w-8"></div>
        <div>User</div>
        <div className="text-right">Hours</div>
        <div className="text-right">Cost</div>
        <div className="text-right">Frames</div>
        <div>Status</div>
      </div>
      
      {/* Rows */}
      <div className="divide-y divide-border">
        {users.map((userData) => (
          <ProductionUserRow key={userData.user_id} userData={userData} dailyLimit={dailyLimit} />
        ))}
      </div>
    </div>
  );
}
