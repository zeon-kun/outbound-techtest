"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, type Feedback } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Code } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [triggeringWebhook, setTriggeringWebhook] = useState(false);

  // Separate useEffect for auth check
  useEffect(() => {
    checkUser();
  }, []);

  // Separate useEffect for data fetching and realtime == CANNOT IMPLEMENT Realtime DB, Supabase Realtime need subscription **sad**
  useEffect(() => {
    if (!user) return;

    fetchFeedbacks();

    console.log("[REALTIME] Setting up subscription for user:", user.id);

    const channel = supabase
      .channel("feedback_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE", // Only listen to updates for now
          schema: "public",
          table: "feedback",
          // Remove filter temporarily to test
        },
        (payload) => {
          console.log("[REALTIME] UPDATE event received:", payload);

          // Check if this feedback belongs to current user
          if (payload.new.user_id !== user.id) {
            console.log("[REALTIME] Not for current user, ignoring");
            return;
          }

          console.log("[REALTIME] Updating feedback:", payload.new.id);

          setFeedbacks((prev) =>
            prev.map((f) => {
              if (f.id === payload.new.id) {
                console.log("[REALTIME] Found and updating feedback in state");
                return payload.new as Feedback;
              }
              return f;
            })
          );

          if (payload.new.status === "Processed") {
            toast.success("Feedback Processed!", {
              description: `Category: ${payload.new.category} | Priority: ${payload.new.priority}`,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("[REALTIME] Subscription status:", status);
      });

    return () => {
      console.log("[REALTIME] Cleaning up subscription");
      supabase.removeChannel(channel);
    };
  }, [user]);

  const triggerN8nWorkflow = async (feedback: Feedback) => {
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
      const username = process.env.NEXT_PUBLIC_N8N_WEBHOOK_USER;
      const password = process.env.NEXT_PUBLIC_N8N_WEBHOOK_PASSWORD;

      if (!webhookUrl) {
        console.warn("[N8N] Webhook URL not configured");
        return;
      }

      const basicAuth = btoa(`${username}:${password}`);

      console.group("[N8N] Auto-triggering workflow");
      console.log("Feedback ID:", feedback.id);
      console.log("Title:", feedback.title);
      console.log("Description:", feedback.description);
      console.groupEnd();

      const startTime = performance.now();

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          id: feedback.id,
          user_id: feedback.user_id,
          title: feedback.title,
          description: feedback.description,
          status: feedback.status,
          created_at: feedback.created_at,
        }),
      });

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      console.group("[N8N] Workflow response");
      console.log("Status:", response.status);
      console.log("Duration:", duration + "ms");
      console.log("Response:", result);
      console.groupEnd();

      // Poll for updates after a short delay
      pollForUpdate(feedback.id);
    } catch (error: any) {
      console.group("[N8N] Workflow error");
      console.error("Error:", error.message);
      console.groupEnd();

      // Show error toast but don't block user
      toast.error("Processing delayed", {
        description: "Will retry automatically",
      });
    }
  };

  const pollForUpdate = async (feedbackId: string, maxAttempts: number = 5) => {
    let attempts = 0;

    const poll = async () => {
      attempts++;
      console.log(`[POLL] Attempt ${attempts}/${maxAttempts}`);

      const { data, error } = await supabase.from("feedback").select("*").eq("id", feedbackId).single();

      if (error) {
        console.error("[POLL] Error:", error);
        return;
      }

      console.log("[POLL] Current status:", data.status);

      // Update the specific feedback in state
      setFeedbacks((prev) => prev.map((f) => (f.id === feedbackId ? data : f)));

      if (data.status === "Processed") {
        console.log("[POLL] Feedback processed!");
        toast.success("Feedback Processed!", {
          description: `Category: ${data.category} | Priority: ${data.priority}`,
        });
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000); // Poll every 2 seconds
      } else {
        console.log("[POLL] Max attempts reached, stopping");
        toast.info("Processing taking longer than expected", {
          description: "Refresh the page to see updates",
        });
      }
    };

    setTimeout(poll, 1500);
  };

  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
    } else {
      setUser(user);
    }
  };

  const fetchFeedbacks = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .eq("user_id", user.id) // Only fetch current user's feedback
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching feedbacks:", error);
      toast.error("Failed to load feedback", {
        description: error.message,
      });
    } else {
      setFeedbacks(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase
      .from("feedback")
      .insert([
        {
          user_id: user.id,
          title,
          description,
          status: "Pending",
        },
      ])
      .select();

    if (error) {
      console.error("[SUBMIT] Insert error:", error);
      toast.error("Submission Failed", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    const newFeedback = data[0];
    console.log("[SUBMIT] Feedback created:", newFeedback.id);

    // Add to state immediately (optimistic update)
    setFeedbacks((prev) => [newFeedback, ...prev]);

    // Clear form
    setTitle("");
    setDescription("");

    toast.success("Feedback Submitted!", {
      description: "Processing your feedback...",
    });

    setLoading(false);

    // Auto-trigger n8n workflow
    triggerN8nWorkflow(newFeedback);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  // Show loading state while checking auth
  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const handleManualTrigger = async (feedbackId: string) => {
    setTriggeringWebhook(true);

    // Find the feedback
    const feedback = feedbacks.find((f) => f.id === feedbackId);
    if (!feedback) {
      toast.error("Feedback not found");
      setTriggeringWebhook(false);
      return;
    }

    console.log("[DEBUG] Manual trigger for feedback:", feedbackId);

    await triggerN8nWorkflow(feedback);

    setTriggeringWebhook(false);
    setDebugModalOpen(false);

    toast.info("Processing manually triggered", {
      description: "Check console for logs",
    });
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900">Feedback Portal</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Button variant="outline" onClick={handleLogout} className="border-border hover:bg-surface">
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Submit Form */}
          <Card className="border border-border shadow-sm bg-white">
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Submit Feedback</h2>
                <p className="text-sm text-gray-600 mt-1">Share your thoughts or report issues</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                    Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="Brief summary"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-border focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium text-gray-700">
                    Description
                  </Label>
                  <textarea
                    id="description"
                    placeholder="Try words like 'urgent', 'broken', 'error' to see auto-classification"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full min-h-[120px] px-3 py-2 text-sm border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none resize-none"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary-hover text-white"
                  disabled={loading}
                >
                  {loading ? "Submitting..." : "Submit Feedback"}
                </Button>
              </form>
            </div>
          </Card>

          {/* Feedback List */}
          <Card className="border border-border shadow-sm bg-white">
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Your Feedback</h2>
                <p className="text-sm text-gray-600 mt-1">Track your submissions ({feedbacks.length})</p>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {feedbacks.length === 0 ? (
                  <p className="text-center text-gray-500 py-8 text-sm">No feedback yet</p>
                ) : (
                  feedbacks.map((feedback) => (
                    <div
                      key={feedback.id}
                      className="border border-border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-gray-900 text-sm">{feedback.title}</h3>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              feedback.status === "Pending"
                                ? "bg-yellow-50 text-yellow-700 border border-yellow-200 animate-pulse"
                                : "bg-blue-50 text-primary border border-blue-200"
                            }`}
                          >
                            {feedback.status}
                          </span>

                          {/* Debug Button */}
                          <button
                            onClick={() => {
                              setSelectedFeedbackId(feedback.id);
                              setDebugModalOpen(true);
                            }}
                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors flex items-center gap-1"
                            title="Manually trigger n8n workflow"
                          >
                            <Code className="w-3 h-3" />
                            Debug
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{feedback.description}</p>

                      <div className="flex items-center gap-2 flex-wrap">
                        {feedback.category && (
                          <span className="text-xs px-2 py-1 rounded bg-surface text-gray-700 border border-border">
                            {feedback.category}
                          </span>
                        )}
                        {feedback.priority && (
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              feedback.priority === "High"
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-surface text-gray-700 border border-border"
                            }`}
                          >
                            {feedback.priority}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 ml-auto">
                          {new Date(feedback.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
        {/* Debug Modal */}
        {debugModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg border border-border shadow-lg bg-white">
              <div className="p-6 space-y-4">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Debug: Manual Webhook Trigger</h3>
                  <p className="text-sm text-gray-600 mt-1">Send feedback data to n8n workflow for processing</p>
                </div>

                {selectedFeedbackId && (
                  <>
                    <div className="space-y-3">
                      <div className="bg-surface border border-border rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                          Request Details
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex">
                            <span className="text-gray-500 w-32">Feedback ID:</span>
                            <span className="text-gray-900 font-mono text-xs">{selectedFeedbackId}</span>
                          </div>
                          <div className="flex">
                            <span className="text-gray-500 w-32">Method:</span>
                            <span className="text-gray-900 font-mono text-xs">POST</span>
                          </div>
                          <div className="flex">
                            <span className="text-gray-500 w-32">Content-Type:</span>
                            <span className="text-gray-900 font-mono text-xs">application/json</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-surface border border-border rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Endpoint</h4>
                        <code className="text-xs text-gray-900 break-all block font-mono bg-white border border-border rounded px-2 py-1">
                          {process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || "http://localhost:5678/webhook/feedback"}
                        </code>
                      </div>

                      <div className="bg-surface border border-border rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                          Payload Preview
                        </h4>
                        <pre className="text-xs text-gray-900 overflow-x-auto font-mono bg-white border border-border rounded px-2 py-2">
                          {JSON.stringify(
                            {
                              id: selectedFeedbackId,
                              title: feedbacks.find((f) => f.id === selectedFeedbackId)?.title || "",
                              description: feedbacks.find((f) => f.id === selectedFeedbackId)?.description || "",
                              status: feedbacks.find((f) => f.id === selectedFeedbackId)?.status || "",
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-900">
                        <strong>Note:</strong> Ensure n8n workflow is active and webhook endpoint is accessible. Check
                        browser console for detailed logs.
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4 border-t border-border">
                  <Button
                    onClick={() => selectedFeedbackId && handleManualTrigger(selectedFeedbackId)}
                    className="flex-1 bg-primary hover:bg-primary-hover text-white"
                    disabled={triggeringWebhook}
                  >
                    {triggeringWebhook ? "Sending Request..." : "Trigger Webhook"}
                  </Button>
                  <Button
                    onClick={() => {
                      setDebugModalOpen(false);
                      setSelectedFeedbackId(null);
                    }}
                    variant="outline"
                    className="flex-1 border-border hover:bg-surface"
                    disabled={triggeringWebhook}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
