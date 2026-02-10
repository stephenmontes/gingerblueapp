import { useState, useEffect, useCallback, useRef } from 'react';
import { API } from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  MessageCircle, FileText, Phone, Mail, Calendar, CheckSquare, 
  Rocket, MoreHorizontal, Pin, Trash2, Edit2, Reply, Heart,
  Bell, BellOff, Send, Paperclip, Image, X, ChevronDown, ChevronUp,
  GitBranch, User, Info, RefreshCw, ShoppingCart
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Activity type icons mapping
const ACTIVITY_ICONS = {
  chat_post: MessageCircle,
  comment: MessageCircle,
  note: FileText,
  call_log: Phone,
  email_log: Mail,
  meeting_log: Calendar,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  onboarding: Rocket,
  stage_changed: GitBranch,
  owner_changed: User,
  system_event: Info,
  shopify_sync: RefreshCw,
  order_created: ShoppingCart
};

// Activity type colors
const ACTIVITY_COLORS = {
  chat_post: 'bg-blue-500',
  comment: 'bg-gray-500',
  note: 'bg-amber-500',
  call_log: 'bg-green-500',
  email_log: 'bg-purple-500',
  meeting_log: 'bg-pink-500',
  task_created: 'bg-orange-500',
  task_completed: 'bg-green-600',
  onboarding: 'bg-cyan-500',
  stage_changed: 'bg-indigo-500',
  owner_changed: 'bg-teal-500',
  system_event: 'bg-gray-400',
  shopify_sync: 'bg-lime-500',
  order_created: 'bg-emerald-500'
};

// Activity type labels
const ACTIVITY_LABELS = {
  chat_post: 'Post',
  comment: 'Comment',
  note: 'Note',
  call_log: 'Call',
  email_log: 'Email',
  meeting_log: 'Meeting',
  task_created: 'Task Created',
  task_completed: 'Task Completed',
  onboarding: 'Onboarding',
  stage_changed: 'Stage Changed',
  owner_changed: 'Owner Changed',
  system_event: 'System',
  shopify_sync: 'Shopify Update',
  order_created: 'Order Created'
};

// User-created activity types for the composer
const USER_ACTIVITY_TYPES = [
  { value: 'chat_post', label: 'Post', icon: MessageCircle },
  { value: 'note', label: 'Note', icon: FileText },
  { value: 'call_log', label: 'Log a Call', icon: Phone },
  { value: 'email_log', label: 'Log Email', icon: Mail },
  { value: 'meeting_log', label: 'Log Meeting', icon: Calendar },
  { value: 'onboarding', label: 'Onboarding', icon: Rocket }
];

export default function ActivityTimeline({ 
  entityType, 
  entityId, 
  entityName = '',
  showComposer = true,
  compact = false,
  maxHeight = '600px'
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [activityFilter, setActivityFilter] = useState('all');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  
  // Composer state
  const [composerType, setComposerType] = useState('chat_post');
  const [composerBody, setComposerBody] = useState('');
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [posting, setPosting] = useState(false);
  
  // Call log specific fields
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  
  // File upload state
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Edit/Reply state
  const [editingItem, setEditingItem] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const fetchTimeline = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        page_size: 20
      });
      if (activityFilter !== 'all') {
        params.append('activity_types', activityFilter);
      }
      
      const res = await fetch(
        `${API}/timeline/items/${entityType}/${entityId}?${params}`, 
        { credentials: 'include' }
      );
      
      if (!res.ok) throw new Error('Failed to load timeline');
      
      const data = await res.json();
      setItems(data.items || []);
      setPagination(data.pagination || { page: 1, total: 0, total_pages: 0 });
    } catch (error) {
      console.error('Timeline fetch error:', error);
      toast.error("Failed to load activity timeline");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, pagination.page, activityFilter]);

  const checkFollowStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${API}/timeline/follow/${entityType}/${entityId}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.is_following);
      }
    } catch (error) {
      console.error('Failed to check follow status:', error);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (entityType && entityId) {
      fetchTimeline();
      checkFollowStatus();
    }
  }, [fetchTimeline, checkFollowStatus, entityType, entityId]);

  // Poll for updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (entityType && entityId) {
        fetchTimeline();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchTimeline, entityType, entityId]);

  const handlePost = async () => {
    if (!composerBody.trim() && attachments.length === 0) {
      toast.error("Please enter a message");
      return;
    }
    
    try {
      setPosting(true);
      
      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        activity_type: composerType,
        body: composerBody,
        visibility: 'public',
        attachments: attachments,
        metadata: {}
      };
      
      // Add call-specific fields
      if (composerType === 'call_log') {
        payload.call_duration_minutes = parseInt(callDuration) || 0;
        payload.call_outcome = callOutcome;
        payload.metadata = {
          duration_minutes: parseInt(callDuration) || 0,
          outcome: callOutcome
        };
      }
      
      // Add reply parent
      if (replyingTo) {
        payload.parent_id = replyingTo.item_id;
      }
      
      const res = await fetch(`${API}/timeline/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Failed to create post');
      
      toast.success("Posted successfully");
      
      // Reset composer
      setComposerBody('');
      setComposerExpanded(false);
      setAttachments([]);
      setCallDuration('');
      setCallOutcome('');
      setReplyingTo(null);
      
      // Refresh timeline
      fetchTimeline();
    } catch (error) {
      console.error('Post error:', error);
      toast.error("Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const handleToggleFollow = async () => {
    try {
      setFollowLoading(true);
      
      if (isFollowing) {
        const res = await fetch(
          `${API}/timeline/follow/${entityType}/${entityId}`,
          { method: 'DELETE', credentials: 'include' }
        );
        if (res.ok) {
          setIsFollowing(false);
          toast.success("Unfollowed");
        }
      } else {
        const res = await fetch(
          `${API}/timeline/follow/${entityType}/${entityId}`,
          { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              notify_on: ['chat_post', 'comment', 'stage_changed', 'mention']
            })
          }
        );
        if (res.ok) {
          setIsFollowing(true);
          toast.success("Now following - you'll receive notifications");
        }
      }
    } catch (error) {
      toast.error("Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    
    try {
      const res = await fetch(`${API}/timeline/items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Failed to delete');
      
      toast.success("Deleted");
      fetchTimeline();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const handleTogglePin = async (itemId) => {
    try {
      const res = await fetch(`${API}/timeline/items/${itemId}/pin`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Failed to toggle pin');
      
      const data = await res.json();
      toast.success(data.is_pinned ? "Pinned" : "Unpinned");
      fetchTimeline();
    } catch (error) {
      toast.error("Failed to toggle pin");
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    // For now, just store file info - actual upload would be implemented with cloud storage
    const newAttachments = files.map(file => ({
      attachment_id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filename: file.name,
      file_url: URL.createObjectURL(file),
      file_type: file.type,
      file_size: file.size,
      uploaded_by: 'current_user',
      uploaded_at: new Date().toISOString()
    }));
    setAttachments([...attachments, ...newAttachments]);
    toast.info("File attached (preview only)");
  };

  const removeAttachment = (attachmentId) => {
    setAttachments(attachments.filter(a => a.attachment_id !== attachmentId));
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTimestamp = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return timestamp;
    }
  };

  const renderTimelineItem = (item, isReply = false) => {
    const Icon = ACTIVITY_ICONS[item.activity_type] || Info;
    const colorClass = ACTIVITY_COLORS[item.activity_type] || 'bg-gray-500';
    const label = ACTIVITY_LABELS[item.activity_type] || item.activity_type;
    const isSystemEvent = ['stage_changed', 'owner_changed', 'system_event', 'shopify_sync', 'order_created', 'task_created', 'task_completed'].includes(item.activity_type);

    return (
      <div 
        key={item.item_id}
        className={`relative ${isReply ? 'ml-12 mt-2' : 'mb-4'}`}
        data-testid={`timeline-item-${item.item_id}`}
      >
        {/* Pin indicator */}
        {item.is_pinned && !isReply && (
          <div className="absolute -top-2 left-8 z-10">
            <Badge variant="secondary" className="text-xs">
              <Pin className="h-3 w-3 mr-1" />
              Pinned
            </Badge>
          </div>
        )}
        
        <div className={`flex gap-3 ${item.is_pinned ? 'mt-4' : ''}`}>
          {/* Avatar/Icon */}
          <div className="flex-shrink-0">
            {isSystemEvent ? (
              <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
            ) : (
              <Avatar className="h-8 w-8">
                <AvatarFallback className={colorClass}>
                  {getInitials(item.created_by_name)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <Card className={`${isSystemEvent ? 'bg-muted/50 border-dashed' : ''}`}>
              <CardContent className="p-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {item.created_by_name || 'System'}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      <Icon className="h-3 w-3 mr-1" />
                      {label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(item.created_at)}
                    </span>
                    {item.is_edited && (
                      <span className="text-xs text-muted-foreground">(edited)</span>
                    )}
                  </div>
                  
                  {/* Actions menu */}
                  {!isSystemEvent && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setReplyingTo(item)}>
                          <Reply className="h-4 w-4 mr-2" />
                          Reply
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTogglePin(item.item_id)}>
                          <Pin className="h-4 w-4 mr-2" />
                          {item.is_pinned ? 'Unpin' : 'Pin'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingItem(item)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(item.item_id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                
                {/* Body */}
                <div className="text-sm whitespace-pre-wrap">
                  {item.body}
                </div>
                
                {/* Call-specific info */}
                {item.activity_type === 'call_log' && item.call_duration_minutes > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Duration: {item.call_duration_minutes} min
                    {item.call_outcome && ` • Outcome: ${item.call_outcome}`}
                  </div>
                )}
                
                {/* Metadata for system events */}
                {isSystemEvent && item.metadata && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {item.metadata.old_value && item.metadata.new_value && (
                      <span>
                        {item.metadata.old_value} → {item.metadata.new_value}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Attachments */}
                {item.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.attachments.map(att => (
                      <a 
                        key={att.attachment_id}
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                      >
                        <Paperclip className="h-3 w-3" />
                        {att.filename}
                      </a>
                    ))}
                  </div>
                )}
                
                {/* Mentions */}
                {item.mentions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.mentions.map((m, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        @{m.mentioned_user_name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Replies */}
            {item.replies?.length > 0 && (
              <div className="mt-2">
                {item.replies.map(reply => renderTimelineItem(reply, true))}
                {item.has_more_replies && (
                  <Button variant="ghost" size="sm" className="ml-12 mt-1 text-xs">
                    View more replies...
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="activity-timeline">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Activity Timeline</h3>
          <Badge variant="outline">{pagination.total} items</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isFollowing ? "default" : "outline"}
            size="sm"
            onClick={handleToggleFollow}
            disabled={followLoading}
            data-testid="follow-btn"
          >
            {isFollowing ? (
              <>
                <Bell className="h-4 w-4 mr-1" />
                Following
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 mr-1" />
                Follow
              </>
            )}
          </Button>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="All Activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              <SelectItem value="chat_post">Posts</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="call_log">Calls</SelectItem>
              <SelectItem value="email_log">Emails</SelectItem>
              <SelectItem value="meeting_log">Meetings</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
              <SelectItem value="stage_changed">Stage Changes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Composer */}
      {showComposer && (
        <Card data-testid="timeline-composer">
          <CardContent className="p-3">
            {/* Reply indicator */}
            {replyingTo && (
              <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                <Reply className="h-4 w-4" />
                Replying to {replyingTo.created_by_name}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 w-5 p-0"
                  onClick={() => setReplyingTo(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            {/* Activity type tabs */}
            <Tabs value={composerType} onValueChange={setComposerType}>
              <TabsList className="h-8 mb-2">
                {USER_ACTIVITY_TYPES.map(type => (
                  <TabsTrigger 
                    key={type.value} 
                    value={type.value}
                    className="text-xs px-2"
                  >
                    <type.icon className="h-3 w-3 mr-1" />
                    {type.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            
            {/* Composer input */}
            <div className="space-y-2">
              <Textarea
                placeholder={
                  composerType === 'chat_post' ? "Share an update with your team..." :
                  composerType === 'note' ? "Add a note..." :
                  composerType === 'call_log' ? "Log call details..." :
                  composerType === 'email_log' ? "Log email summary..." :
                  composerType === 'meeting_log' ? "Log meeting notes..." :
                  composerType === 'onboarding' ? "Log onboarding activity..." :
                  "Write something..."
                }
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                onFocus={() => setComposerExpanded(true)}
                className="min-h-[60px] resize-none"
                data-testid="composer-input"
              />
              
              {/* Call-specific fields */}
              {composerType === 'call_log' && composerExpanded && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Duration (minutes)</Label>
                    <Input 
                      type="number"
                      placeholder="0"
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Outcome</Label>
                    <Select value={callOutcome} onValueChange={setCallOutcome}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="connected">Connected</SelectItem>
                        <SelectItem value="left_voicemail">Left Voicemail</SelectItem>
                        <SelectItem value="no_answer">No Answer</SelectItem>
                        <SelectItem value="busy">Busy</SelectItem>
                        <SelectItem value="wrong_number">Wrong Number</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              
              {/* Attachments preview */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map(att => (
                    <div 
                      key={att.attachment_id}
                      className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs"
                    >
                      <Paperclip className="h-3 w-3" />
                      {att.filename}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => removeAttachment(att.attachment_id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Actions */}
              {composerExpanded && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="attach-file-btn"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Image className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setComposerExpanded(false);
                        setComposerBody('');
                        setAttachments([]);
                        setReplyingTo(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm"
                      onClick={handlePost}
                      disabled={posting || (!composerBody.trim() && attachments.length === 0)}
                      data-testid="post-btn"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {posting ? 'Posting...' : 'Post'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline Items */}
      <div 
        className="space-y-2" 
        style={{ maxHeight, overflowY: 'auto' }}
        data-testid="timeline-items"
      >
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading timeline...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No activity yet</p>
            <p className="text-sm">Be the first to post an update!</p>
          </div>
        ) : (
          <>
            {/* Pinned items first */}
            {items.filter(i => i.is_pinned).map(item => renderTimelineItem(item))}
            
            {/* Regular items */}
            {items.filter(i => !i.is_pinned).map(item => renderTimelineItem(item))}
          </>
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => setPagination(p => ({...p, page: p.page - 1}))}
          >
            Previous
          </Button>
          <span className="flex items-center text-sm">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <Button 
            variant="outline" 
            size="sm"
            disabled={pagination.page >= pagination.total_pages}
            onClick={() => setPagination(p => ({...p, page: p.page + 1}))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
